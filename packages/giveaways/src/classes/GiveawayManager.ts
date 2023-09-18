import { APIEmbed, Awaitable, BaseMessageOptions, ButtonBuilder, ButtonInteraction, ButtonStyle, Channel, Client, Collection, ComponentType, EmbedBuilder, Guild, Interaction, JSONEncodable, Message, PartialMessage, inlineCode, time, userMention } from 'discord.js';
import { CreateGiveawayMessageOptions, CreateGiveawayOptions, IGiveaway, IGiveawayEntry, createGiveawayEmbedOptions } from '../types/giveaway';
import { TypedEmitter, getRandomKey } from 'fallout-utility';
import { BaseDatabaseAdapter } from './BaseDatabaseAdapter';
import { GiveawayError } from './GiveawayError';
import { randomBytes } from 'crypto';
import { resolveFromCachedCollection } from '@reciple/utils';

export interface GiveawayManagerEvents {
    error: [error: Error];
    giveawayCreate: [giveaway: IGiveaway];
    giveawayEnd: [giveaway: IGiveaway, entries: { entries: IGiveawayEntry[]; selected: IGiveawayEntry[]; }];
    giveawayDelete: [giveaway: IGiveaway];
    giveawayEntryAdd: [entry: IGiveawayEntry, giveawayId: string];
    giveawayEntryDelete: [entry: IGiveawayEntry, giveawayId: string];
}

export interface GiveawayManagerOptions<A extends BaseDatabaseAdapter = BaseDatabaseAdapter> {
    databaseAdapter: A;
    client: Client;
    joinButtonCustomId?: string;
    joinButtonEmoji?: string;
    createEmbed?: (giveaway: createGiveawayEmbedOptions) => Awaitable<JSONEncodable<APIEmbed>|APIEmbed>;
    onBeforeHandleInteraction?: (interaction: ButtonInteraction) => Awaitable<boolean>;
}

export class GiveawayManager<A extends BaseDatabaseAdapter = BaseDatabaseAdapter> extends TypedEmitter<GiveawayManagerEvents> {
    readonly client: Client;
    readonly databaseAdapter: A;
    readonly giveawayTimouts: Collection<string, { giveawayId: string; timeout: NodeJS.Timeout; }> = new Collection();
    readonly joinButtonCustomId: string = 'giveaway-join';
    readonly joinButtonEmoji: string = '🎉';
    readonly createEmbed: Exclude<GiveawayManagerOptions<A>['createEmbed'], undefined> = GiveawayManager.defaultCreateEmbed;
    readonly onBeforeHandleInteraction: Exclude<GiveawayManagerOptions<A>['onBeforeHandleInteraction'], undefined> = () => true;

    private _ready: boolean = false;

    constructor(options: GiveawayManagerOptions<A>) {
        super();

        this.client = options.client;
        this.databaseAdapter = options.databaseAdapter;
        this.joinButtonCustomId = options.joinButtonCustomId ?? this.joinButtonCustomId;
        this.joinButtonEmoji = options.joinButtonEmoji ?? this.joinButtonEmoji;
        this.createEmbed = options.createEmbed ?? this.createEmbed;
        this.onBeforeHandleInteraction = options.onBeforeHandleInteraction ?? this.onBeforeHandleInteraction;

        this._err = this._err.bind(this);
        this._guildDelete = this._guildDelete.bind(this);
        this._channelDelete = this._channelDelete.bind(this);
        this._messageDelete = this._messageDelete.bind(this);
        this._messageDeleteBulk = this._messageDeleteBulk.bind(this);
        this._interactionCreate = this._interactionCreate.bind(this);
    }

    /**
     * Toggles user's giveaway entry
     * @param giveawayId The giveaway id
     * @param userId The user id
     * @param updateMessage Updates the giveaway message
     * @returns Returns a giveaway entry data if entry is added, null if removed
     */
    public async toggleGiveawayEntry(giveawayId: string, userId: string, updateMessage: boolean = true): Promise<IGiveawayEntry|null> {
        if (!this._ready) throw new GiveawayError('Giveaway manager is not ready');

        let entries = await this.databaseAdapter.fetchGiveawayEntries({ filter: { giveawayId } });
        let entry = entries.find(e => e.userId === userId) ?? null;

        if (entry) {
            await this.databaseAdapter.deleteGiveawayEntry(entry.id);
            entries = entries.filter(e => entry?.id !== e.id);

            this.emit('giveawayEntryDelete', entry, giveawayId);
            entry = null;
        } else {
            entry = await this.databaseAdapter.createGiveawayEntry(giveawayId, {
                id: this.createDataId(),
                createdAt: new Date(),
                giveawayId,
                userId
            });

            entries.push(entry);
            this.emit('giveawayEntryAdd', entry, giveawayId);
        }

        if (updateMessage) {
            const giveaway = await this.databaseAdapter.fetchGiveaway(giveawayId);
            if (!giveaway) throw new GiveawayError(`Giveaway id not found: ${giveawayId}`)

            const message = await this.getGiveawayMessage(giveaway);
            if (!message) {
                await this.databaseAdapter.deleteGiveaway(giveawayId);
                throw new GiveawayError(`Giveaway message not found!`);
            }

            await message.edit(await this.createGiveawayMessageOptions({
                ...giveaway,
                entries: entries.length
            }));
        }

        return entry;
    }

    /**
     * Creates a giveaway
     * @param options Giveaway options
     * @returns The giveaway message
     */
    public async createGiveaway(options: CreateGiveawayOptions): Promise<Message> {
        if (!this._ready) throw new GiveawayError('Giveaway manager is not ready');

        const createdAt = new Date();
        const endsAt = typeof options.endsAt === 'number' ? new Date(Date.now() + options.endsAt) : options.endsAt;
        const duration = typeof options.endsAt === 'number' ? options.endsAt : options.endsAt.getTime() - Date.now();
        const channel = options.channel;

        if (!isFinite(duration) || isNaN(duration) || duration === 0 || duration > 2147483647) throw new GiveawayError('Duration must be a positive number below or equal to 25 days (32 bit integer limit)');

        const data: CreateGiveawayMessageOptions = {
            name: options.name,
            authorId: options.authorId,
            winnerCount: options.winnerCount ?? 1,
            createdAt,
            endsAt,
            ended: false,
            endedAt: null,
            winnersEntryId: [],
            entries: 0,
        };

        const message = await channel.send({
            ...(await this.createGiveawayMessageOptions(data)),
            content: options.content
        });

        data.entries = undefined;

        const giveaway = await this.databaseAdapter.createGiveaway({
            ...data,
            id: this.createDataId(),
            guildId: message.guildId,
            channelId: message.channelId,
            messageId: message.id
        }).catch(async err => {
            message.delete().catch(() => null);
            throw err;
        });

        this.createGiveawayTimeout(giveaway.id, endsAt);
        this.emit('giveawayCreate', giveaway);

        return message;
    }

    /**
     * Ends a giveaway
     * @param giveawayId The giveaway id
     * @param fetchWinnerEntries Fetch winner entries
     * @returns Returns the giveaway winners if fetchWinnerEntries is enabled
     */
    public async endGiveaway(giveawayId: string, fetchWinnerEntries: boolean = true): Promise<IGiveawayEntry[]> {
        if (!this._ready) throw new GiveawayError('Giveaway manager is not ready');

        this.deleteGiveawayTimeout(giveawayId);

        const giveaway = await this.databaseAdapter.fetchGiveaway(giveawayId);
        const entries = await Promise.all((giveaway?.winnersEntryId ?? []).map(e => this.databaseAdapter.fetchGiveawayEntry(e)).filter(Boolean)) as IGiveawayEntry[];
        if (!giveaway || giveaway.ended) return entries;

        const winners = fetchWinnerEntries
            ? await this.getRandomGiveawayEntries(giveawayId, giveaway.winnerCount)
            : { entries: await this.databaseAdapter.fetchGiveawayEntries({ filter: { giveawayId } }), selected: [] };

        const message = await this.getGiveawayMessage(giveaway);
        if (!message) {
            await this.databaseAdapter.deleteGiveaway(giveawayId);
            throw new GiveawayError('Giveaway message not found');
        }

        const endedGiveaway = await this.databaseAdapter.updateGiveaway(giveawayId, {
            ...giveaway,
            ended: true,
            endedAt: new Date(),
            endsAt: new Date(),
            winnersEntryId: winners.selected.map(s => s.id) ?? []
        });

        this.emit('giveawayEnd', giveaway, winners);

        await message.edit(await this.createGiveawayMessageOptions({
            ...endedGiveaway,
            entries: winners.entries.length ?? 0
        }));

        return winners.selected;
    }

    /**
     * Deletes giveaway
     * @param giveawayId The giveaway id
     * @returns Returns the deleted giveaway if there's any
     */
    public async deleteGiveaway(giveawayId: string): Promise<IGiveaway|undefined> {
        if (!this._ready) throw new GiveawayError('Giveaway manager is not ready');

        this.deleteGiveawayTimeout(giveawayId);

        const giveaway = await this.databaseAdapter.fetchGiveaway(giveawayId);
        if (!giveaway) return;

        const message = await this.getGiveawayMessage(giveaway);

        await message?.delete();
        await this.databaseAdapter.deleteGiveaway(giveawayId);
        this.emit('giveawayDelete', giveaway);

        return giveaway;
    }

    /**
     * Creates a giveaway message options
     * @param giveaway Giveaway data
     * @returns The giveaway message options
     */
    public async createGiveawayMessageOptions(giveaway: CreateGiveawayMessageOptions): Promise<BaseMessageOptions> {
        const allEntries: IGiveawayEntry[] = giveaway.winnersEntryId.length && giveaway.id ? await this.databaseAdapter.fetchGiveawayEntries({ filter: { giveawayId: giveaway.id } }) : [];
        const allWinners: string[] = giveaway.winnersEntryId.length
            ? giveaway.winnersEntryId.map(id => allEntries.find(e => e.id === id)?.userId).filter((e): e is string => !!e)
            : [];

        const embed = await Promise.resolve(this.createEmbed({
            ...giveaway,
            manager: this,
            allEntries,
            allWinners
        }));

        return {
            content: giveaway.ended
                ? allWinners.length
                    ? inlineCode('🎉') + allWinners.map((id, i) => (i == allWinners.length && allWinners.length > 1 ? 'and ' : '') + userMention(id)).join(' ') + ' won the giveaway!'
                    : 'There is no winner for this giveaway'
                : undefined,
            embeds: [embed],
            components: [
                {
                    type: ComponentType.ActionRow,
                    components: [
                        new ButtonBuilder()
                            .setCustomId(this.joinButtonCustomId)
                            .setDisabled(giveaway.ended)
                            .setStyle(ButtonStyle.Primary)
                            .setEmoji(this.joinButtonEmoji)
                            .toJSON()
                    ]
                }
            ]
        };
    }

    /**
     * Get random entries from a giveaway
     * @param giveawayId The giveaway id
     * @param winnerCount Count of selected entries
     * @returns Returns the selected winners and entries
     */
    public async getRandomGiveawayEntries(giveawayId: string, winnerCount: number = 1): Promise<{ entries: IGiveawayEntry[]; selected: IGiveawayEntry[]; }> {
        if (!this._ready) throw new GiveawayError('Giveaway manager is not ready');

        const entries = await this.databaseAdapter.fetchGiveawayEntries({ filter: { giveawayId } });
        const selected: IGiveawayEntry[] = [];

        if (entries.length) {
            winnerCount = winnerCount > entries.length ? entries.length : winnerCount;

            for (let i=0; i < winnerCount; i++) {
                const entry = getRandomKey(entries.filter(e => !selected.some(s => s.id === e.id)));
                if (entry) selected.push(entry);
            }
        }

        return { entries, selected };
    }

    /**
     * Get message of a giveaway
     * @param giveaway The giveaway data
     * @returns The giveaway message if there's any
     */
    public async getGiveawayMessage(giveaway: Pick<IGiveaway, 'guildId'|'channelId'|'messageId'>): Promise<Message|undefined> {
        const guild = await resolveFromCachedCollection(giveaway.guildId, this.client.guilds).catch(() => null);
        if (!guild) return;

        const channel = await resolveFromCachedCollection(giveaway.channelId, guild.channels).catch(() => null);
        if (!channel || !channel.isTextBased()) return;

        const message = await resolveFromCachedCollection(giveaway.messageId, channel.messages).catch(() => null);
        if (!message) return;

        return message;
    }

    /**
     * Clean deleted giveaways from database
     * @param giveaways Giveaways to clean
     * @returns Returns the deleted giveaways
     */
    public async clean(giveaways?: IGiveaway[]): Promise<IGiveaway[]> {
        if (!this._ready) throw new GiveawayError('Giveaway manager is not ready');

        giveaways ??= await this.databaseAdapter.fetchGiveaways();

        const cleaned: IGiveaway[] = [];

        for (const giveaway of giveaways) {
            const message = await this.getGiveawayMessage(giveaway);
            if (!message) {
                await this.databaseAdapter.deleteGiveaway(giveaway.id);
                cleaned.push(giveaway);
            }
        }

        return cleaned;
    }

    /**
     * Starts the giveaway manager
     */
    public async start(): Promise<void> {
        if (!this.client.isReady()) throw new GiveawayError('Discord.js client is not yet ready or logged in');

        await this.databaseAdapter.start(this);
        this.databaseAdapter.on('error', this._err);

        this.client.on('guildDelete', this._guildDelete);
        this.client.on('channelDelete', this._channelDelete);
        this.client.on('messageDelete', this._messageDelete);
        this.client.on('messageDeleteBulk', this._messageDeleteBulk);
        this.client.on('interactionCreate', this._interactionCreate);

        this._ready = true;

        const giveaways = await this.databaseAdapter.fetchGiveaways({ filter: { ended: false } });

        for (const giveaway of giveaways) {
            await this.createGiveawayTimeout(giveaway.id, giveaway.endsAt).catch(err => this.emit(err));
        }
    }

    /**
     * Destroy the giveaway manager
     */
    public destroy(): void {
        this._ready = false;

        this.databaseAdapter.removeListener('error', this._err);

        this.client.removeListener('guildDelete', this._guildDelete);
        this.client.removeListener('channelDelete', this._channelDelete);
        this.client.removeListener('messageDelete', this._messageDelete);
        this.client.removeListener('messageDeleteBulk', this._messageDeleteBulk);
        this.client.removeListener('interactionCreate', this._interactionCreate);

        for (const [id, timeout] of this.giveawayTimouts) {
            clearTimeout(timeout.timeout);
            this.giveawayTimouts.delete(id);
        }
    }

    protected createDataId(): string {
        return randomBytes(10).toString('hex');
    }

    protected async createGiveawayTimeout(giveawayId: string, endsAt: Date): Promise<void> {
        if (endsAt.getTime() <= Date.now()) {
            this.endGiveaway(giveawayId);
            return;
        }

        const timer = endsAt.getTime() - Date.now();
        const timeout = setTimeout(() => this.endGiveaway(giveawayId).catch(err => this.emit('error', err)), timer).unref();

        this.giveawayTimouts.set(giveawayId, { giveawayId, timeout });
    }

    protected deleteGiveawayTimeout(giveawayId: string): void {
        const timeout = this.giveawayTimouts.get(giveawayId);
        if (timeout) {
            clearTimeout(timeout.timeout);
            this.giveawayTimouts.delete(giveawayId);
        }
    }

    private async _guildDelete(guild: Guild): Promise<void> {
        try {
            const giveaways = await this.databaseAdapter.deleteGiveaway({ guildId: guild.id });

            for (const giveaway of giveaways) {
                await this.endGiveaway(giveaway.id);
            }
        } catch(err) {
            this.emit('error', err);
        }
    }

    private async _channelDelete(channel: Channel): Promise<void> {
        try {
            const giveaways = await this.databaseAdapter.deleteGiveaway({ channelId: channel.id });

            for (const giveaway of giveaways) {
                await this.endGiveaway(giveaway.id);
            }
        } catch(err) {
            this.emit('error', err);
        }
    }

    private async _messageDelete(message: Message|PartialMessage): Promise<void> {
        try {
            const giveaways = await this.databaseAdapter.deleteGiveaway({ messageId: message.id });

            for (const giveaway of giveaways) {
                await this.endGiveaway(giveaway.id);
            }
        } catch(err) {
            this.emit('error', err);
        }
    }

    private async _messageDeleteBulk(messages: Collection<string, Message|PartialMessage>): Promise<void> {
        for (const message of messages.values()) {
            await this._messageDelete(message);
        }
    }

    private async _interactionCreate(interaction: Interaction): Promise<void> {
        if (!interaction.isButton() || interaction.customId !== this.joinButtonCustomId) return;

        const deffered = await interaction.deferReply({ ephemeral: true }).catch(err => this.emit('error', err));
        if (!deffered) return;

        try {
            const allowed = await Promise.resolve(this.onBeforeHandleInteraction(interaction));
            if (allowed === false) return;

            const message = interaction.message;
            const giveaways = await this.databaseAdapter.fetchGiveaways({ filter: { messageId: message.id } });
            const giveaway = giveaways[0] as IGiveaway|undefined;

            if (!giveaway) {
                await interaction.editReply(`${inlineCode('❌')} Unable to find giveaway from this message`);
                return;
            }

            const entry = await this.toggleGiveawayEntry(giveaway.id, interaction.user.id).catch(err => { this.emit('error', err); });
            if (entry === undefined) {
                await interaction.editReply(`${inlineCode('❌')} Unable to add/remove entry`);
                return;
            }

            if (entry) {
                await interaction.editReply(`${inlineCode('🎉')} Successfully added new entry!`);
            } else {
                await interaction.editReply(`${inlineCode('🎉')} Successfully removed current entry!`);
            }
        } catch (err) {
            this.emit('error', err);
        }
    }

    private _err(err: Error): void {
        this.emit('error', err);
    }

    public static defaultCreateEmbed<A extends BaseDatabaseAdapter = BaseDatabaseAdapter>(giveaway: createGiveawayEmbedOptions<A>): EmbedBuilder {
        const embed = new EmbedBuilder();

        embed.setTitle(giveaway.name);
        embed.setAuthor({ name: '🎉 Giveaway' });
        embed.setColor(giveaway.ended ? 'DarkButNotBlack' : 'Blue');
        embed.addFields({ name: `${inlineCode('⏲️')} End${giveaway.ended ? 'ed' : 's'}`, value: time(giveaway.endsAt, 'R') + (!giveaway.ended ? ` (${time(giveaway.endsAt)})` : '') });
        embed.addFields({ name: `${inlineCode('👥')} Entries`, value: `${giveaway.entries ? inlineCode(giveaway.entries.toLocaleString('en-US')) : '**No entries**'}` });
        embed.setFooter({ text: giveaway.ended ? 'Ended' : 'Active' });
        embed.setTimestamp(giveaway?.endedAt ?? giveaway.createdAt);

        if (giveaway.ended) {
            embed.addFields({
                name: (inlineCode('🏆') + ' Winner') + (giveaway.allWinners.length > 1 ? 's' : ''),
                value: !giveaway.allWinners.length ? inlineCode('none') : giveaway.allWinners.map(id => `${userMention(id)} ${inlineCode(id)}`).join('\n')
            });
        }

        return embed;
    }
}