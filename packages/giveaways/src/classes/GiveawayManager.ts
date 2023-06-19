import { BaseDatabaseAdapter } from './BaseDatabaseAdapter';
import { TypedEmitter, getRandomKey } from 'fallout-utility';
import { BaseMessageOptions, ButtonBuilder, ButtonStyle, Channel, Client, Collection, ComponentType, EmbedBuilder, Guild, Interaction, Message, PartialMessage, inlineCode, time, userMention } from 'discord.js';
import { GiveawayError } from './GiveawayError';
import { CreateGiveawayMessageOptions, CreateGiveawayOptions, IGiveaway, IGiveawayEntry } from '../types/giveaway';
import { randomBytes } from 'crypto';

export interface GiveawayManagerEvents {
    error: [error: Error];
}

export interface GiveawayManagerOptions {
    databaseAdapter: BaseDatabaseAdapter;
    client: Client;
    joinButtonCustomId?: string;
}

export class GiveawayManager extends TypedEmitter<GiveawayManagerEvents> {
    readonly client: Client;
    readonly databaseAdapter: BaseDatabaseAdapter;
    readonly giveawayTimouts: Collection<string, { giveawayId: string; timeout: NodeJS.Timeout; }> = new Collection();
    readonly joinButtonCustomId: string = 'giveaway-join';

    private _ready: boolean = false;

    constructor(options: GiveawayManagerOptions) {
        super();

        this.client = options.client;
        this.databaseAdapter = options.databaseAdapter;
        this.joinButtonCustomId = options.joinButtonCustomId ?? this.joinButtonCustomId;

        this._err = this._err.bind(this);
        this._guildDelete = this._guildDelete.bind(this);
        this._channelDelete = this._channelDelete.bind(this);
        this._messageDelete = this._messageDelete.bind(this);
        this._messageDeleteBulk = this._messageDeleteBulk.bind(this);
        this._interactionCreate = this._interactionCreate.bind(this);
    }

    public async toggleGiveawayEntry(giveawayId: string, userId: string, updateMessage: boolean = true): Promise<IGiveawayEntry|null> {
        let entries = await this.databaseAdapter.fetchGiveawayEntries({ filter: { giveawayId } });
        let entry = entries.find(e => e.userId === userId) ?? null;

        if (entry) {
            await this.databaseAdapter.deleteGiveawayEntry(entry.id);
            entries = entries.filter(e => entry?.id === e.id);

            entry = null;
        } else {
            entry = await this.databaseAdapter.createGiveawayEntry(giveawayId, {
                id: this.createDataId(),
                createdAt: new Date(),
                giveawayId,
                userId
            });

            entries.push(entry);
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

        const { id } = await this.databaseAdapter.createGiveaway({
            ...data,
            id: this.createDataId(),
            guildId: message.guildId,
            channelId: message.channelId,
            messageId: message.id
        });

        this.createGiveawayTimeout(id, endsAt);

        return message;
    }

    public async createGiveawayMessageOptions(giveaway: CreateGiveawayMessageOptions): Promise<BaseMessageOptions> {
        const embed = new EmbedBuilder();

        embed.setTitle(giveaway.name);
        embed.setAuthor({ name: '🎉 Giveaway' });
        embed.setColor(giveaway.ended ? 'DarkButNotBlack' : 'Blue');
        embed.addFields({ name: `${inlineCode('⏲️')} End${giveaway.ended ? 'ed' : 's'}`, value: time(giveaway.endsAt, 'R') + (!giveaway.ended ? `(${time(giveaway.endsAt)})` : '') });
        embed.addFields({ name: `${inlineCode('👥')} Entries`, value: `${giveaway.entries ? inlineCode(giveaway.entries.toLocaleString('en-US')) : '**No entries**'}` });
        embed.setFooter({ text: giveaway.ended ? 'Ended' : 'Active' });
        embed.setTimestamp(giveaway?.endedAt ?? giveaway.createdAt);

        let isDisabled: boolean = false;

        const entries: IGiveawayEntry[] = giveaway.winnersEntryId.length && giveaway.id ? await this.databaseAdapter.fetchGiveawayEntries({ filter: { giveawayId: giveaway.id } }) : [];
        const winners: string[] = giveaway.winnersEntryId.length
            ? giveaway.winnersEntryId.map(id => entries.find(e => e.id === id)?.userId).filter((e): e is string => !!e)
            : [];

        if (giveaway.ended) {
            embed.addFields({
                name: (inlineCode('🏆') + ' Winner') + (winners.length > 1 ? 's' : ''),
                value: !winners.length ? inlineCode('none') : winners.map(id => `${userMention(id)} ${inlineCode(id)}`).join('\n')
            });

            isDisabled = true;
        }

        return {
            content: giveaway.ended
                ? winners.length
                    ? inlineCode('🎉') + winners.map((id, i) => (i == winners.length && winners.length > 1 ? 'and ' : '') + userMention(id)).join(' ') + ' won the giveaway!'
                    : 'There is no winner for this giveaway'
                : undefined,
            embeds: [embed.toJSON()],
            components: [
                {
                    type: ComponentType.ActionRow,
                    components: [
                        new ButtonBuilder()
                            .setCustomId(this.joinButtonCustomId)
                            .setDisabled(isDisabled)
                            .setStyle(ButtonStyle.Primary)
                            .setEmoji('🎉')
                            .toJSON()
                    ]
                }
            ]
        };
    }

    public createDataId(): string {
        return randomBytes(10).toString('hex');
    }

    public async endGiveaway(giveawayId: string, fetchWinnerEntries?: true): Promise<undefined>;
    public async endGiveaway(giveawayId: string, fetchWinnerEntries?: false): Promise<IGiveawayEntry[]>;
    public async endGiveaway(giveawayId: string, fetchWinnerEntries: boolean = true): Promise<undefined|IGiveawayEntry[]> {
        this.deleteGiveawayTimeout(giveawayId);

        const giveaway = await this.databaseAdapter.fetchGiveaway(giveawayId);
        const entries = await Promise.all((giveaway?.winnersEntryId ?? []).map(e => this.databaseAdapter.fetchGiveawayEntry(e)).filter(Boolean)) as IGiveawayEntry[];
        if (!giveaway || giveaway.ended) return fetchWinnerEntries ? entries : undefined;

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

        await message.edit(await this.createGiveawayMessageOptions({
            ...endedGiveaway,
            entries: winners.entries.length ?? 0
        }));

        return fetchWinnerEntries ? (winners?.selected ?? []) : undefined
    }

    public async getRandomGiveawayEntries(giveawayId: string, winnerCount: number = 1): Promise<{ entries: IGiveawayEntry[]; selected: IGiveawayEntry[]; }> {
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

    public async getGiveawayMessage(giveaway: IGiveaway): Promise<Message|undefined> {
        const guild = this.client.guilds.cache.get(giveaway.guildId) ?? await this.client.guilds.fetch(giveaway.guildId).catch(() => null);
        if (!guild) return;

        const channel = guild.channels.cache.get(giveaway.channelId) ?? await guild.channels.fetch(giveaway.channelId).catch(() => null);
        if (!channel || !channel.isTextBased()) return;

        const message = channel.messages.cache.get(giveaway.messageId) ?? await channel.messages.fetch(giveaway.messageId).catch(() => null);
        if (!message) return;

        return message;
    }

    public async clean(giveaways?: IGiveaway[]): Promise<void> {
        giveaways ??= await this.databaseAdapter.fetchGiveaways();

        for (const giveaway of giveaways) {
            const message = await this.getGiveawayMessage(giveaway);
            if (!message) await this.databaseAdapter.deleteGiveaway(giveaway.id);
        }
    }

    public async createGiveawayTimeout(giveawayId: string, endsAt: Date): Promise<void> {
        if (endsAt.getTime() <= Date.now()) return this.endGiveaway(giveawayId);

        const timer = endsAt.getTime() - Date.now();
        const timeout = setTimeout(() => this.endGiveaway(giveawayId).catch(err => this.emit('error', err)), timer).unref();

        this.giveawayTimouts.set(giveawayId, { giveawayId, timeout });
    }

    public deleteGiveawayTimeout(giveawayId: string): void {
        const timeout = this.giveawayTimouts.get(giveawayId);
        if (timeout) {
            clearTimeout(timeout.timeout);
            this.giveawayTimouts.delete(giveawayId);
        }
    }

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

    private async _guildDelete(guild: Guild): Promise<void> {
        const giveaways = await this.databaseAdapter.deleteGiveaway({ guildId: guild.id });

        for (const giveaway of giveaways) {
            await this.endGiveaway(giveaway.id);
        }
    }

    private async _channelDelete(channel: Channel): Promise<void> {
        const giveaways = await this.databaseAdapter.deleteGiveaway({ channelId: channel.id });

        for (const giveaway of giveaways) {
            await this.endGiveaway(giveaway.id);
        }
    }

    private async _messageDelete(message: Message|PartialMessage): Promise<void> {
        const giveaways = await this.databaseAdapter.deleteGiveaway({ messageId: message.id });

        for (const giveaway of giveaways) {
            await this.endGiveaway(giveaway.id);
        }
    }

    private async _messageDeleteBulk(messages: Collection<string, Message|PartialMessage>): Promise<void> {
        for (const message of messages.values()) {
            await this._messageDelete(message);
        }
    }

    private async _interactionCreate(interaction: Interaction): Promise<void> {
        if (!interaction.isButton() || interaction.customId !== this.joinButtonCustomId) return;

        await interaction.deferReply({ ephemeral: true });

        const message = interaction.message;
        const giveaways = await this.databaseAdapter.fetchGiveaways({ filter: { messageId: message.id } });
        const giveaway = giveaways[0] as IGiveaway|undefined;

        if (!giveaway) {
            await interaction.editReply(`${inlineCode('❌')} Unable to find giveaway from this message`);
            return;
        }

        const entry = await this.toggleGiveawayEntry(giveaway.id, interaction.user.id).catch(() => undefined);
        if (entry === undefined) {
            await interaction.editReply(`${inlineCode('❌')} Unable to add/remove entry`);
            return;
        }

        if (entry) {
            await interaction.editReply(`${inlineCode('🎉')} Successfully added new entry!`);
        } else {
            await interaction.editReply(`${inlineCode('🎉')} Successfully removed current entry!`);
        }
    }

    private _err(err: Error): void {
        this.emit('error', err);
    }
}