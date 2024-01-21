import { GiveawayManagerButtonOptions, GiveawayManagerCreateGiveawayEmbedOptions, GiveawayManagerCreateGiveawayMessageOptions, GiveawayManagerCreateGiveawayOptions, GiveawayManagerEntriesData, GiveawayManagerSelectGiveawayEntriesOptions, RawGiveaway, RawGiveawayEntry } from '../types/structures';
import { BaseGiveawayDatabaseAdapter } from './BaseGiveawayDatabaseAdapter';
import { Awaitable, JSONEncodable, TypedEmitter } from 'fallout-utility';
import { APIEmbed, BaseMessageOptions, ButtonInteraction, ButtonStyle, Client, Collection, ComponentType, EmbedBuilder, GuildTextBasedChannel, InteractionButtonComponentData, Message, inlineCode, time, userMention } from 'discord.js';
import { GiveawayManagerError } from './GiveawayManagerError';
import { GiveawayManagerEventHandler } from './GiveawayManagerEventHandler';

export interface GiveawayManagerEvents {
    error: [error: Error];
    giveawayCreate: [giveaway: RawGiveaway];
    giveawayEnd: [giveaway: RawGiveaway, winnerData: GiveawayManagerEntriesData];
    giveawayDelete: [giveaway: RawGiveaway, entries: RawGiveawayEntry[]];
    giveawayEntryAdd: [entry: RawGiveawayEntry];
    giveawayEntryDelete: [entry: RawGiveawayEntry];
}

export interface GiveawayManagerOptions<Database extends BaseGiveawayDatabaseAdapter = BaseGiveawayDatabaseAdapter> {
    database: Database;
    client: Client;
    dmWinners?: boolean;
    joinButtonData?: GiveawayManagerButtonOptions;
    maxTimeoutMs?: number;
    createEmbed?: (data: GiveawayManagerCreateGiveawayEmbedOptions) => Awaitable<JSONEncodable<APIEmbed>|APIEmbed>;
    onBeforeHandleInteraction?: (interaction: ButtonInteraction) => Awaitable<boolean>;
    selectWinnerEntries?: (entries: RawGiveawayEntry[], needed: number) => Awaitable<RawGiveawayEntry[]>;
}

export class GiveawayManager<Database extends BaseGiveawayDatabaseAdapter = BaseGiveawayDatabaseAdapter> extends TypedEmitter {
    public static readonly joinButton: Omit<InteractionButtonComponentData, 'disabled'|'type'> = {
        emoji: '🎉',
        customId: '@falloutstudios/djs-giveaways',
        style: ButtonStyle.Primary
    };

    public static createEmbed<Database extends BaseGiveawayDatabaseAdapter = BaseGiveawayDatabaseAdapter>(options: GiveawayManagerCreateGiveawayEmbedOptions<Database>): EmbedBuilder {
        const embed = new EmbedBuilder();

        embed.setTitle(options.giveaway.name);
        embed.setAuthor({ name: '🎉 Giveaway' });
        embed.setDescription(options.giveaway.description ?? null);
        embed.setColor(options.giveaway.ended ? 'DarkButNotBlack' : options.giveaway.paused ? 'Grey' : 'Blue');

        if (!options.giveaway.paused) embed.addFields({
            name: `${inlineCode('⏲️')} End${options.giveaway.ended ? 'ed' : 's At'}`,
            value: time(options.giveaway.dueDate, 'R') + (!options.giveaway.ended ? ` (${time(options.giveaway.dueDate)})` : '')
        });

        embed.addFields({
            name: `${inlineCode('👥')} Entries`,
            value: `${options.entries?.allEntries ? inlineCode(options.entries.allEntries.length.toLocaleString()) : '**No entries**'}`
        });

        embed.setFooter({ text: options.giveaway.ended ? 'Ended' : options.giveaway.paused ? 'Paused' : 'Active' });
        embed.setTimestamp(options.giveaway?.ended ? options.giveaway.dueDate : options.giveaway.createdAt);

        if (options.giveaway.hostId) embed.addFields({ name: `${inlineCode('👤')} Hosted by`, value: `${userMention(options.giveaway.hostId)}` });

        if (!options.giveaway.ended) {
            if (options.giveaway.winnerCount > 1) embed.addFields({ name: `${inlineCode('🎁')} Winners`, value: `${options.giveaway.winnerCount.toLocaleString()}` });
        } else {
            embed.addFields({
                name: (inlineCode('🏆') + ' Winner') + (options.entries && options.entries.winnersUserId.length > 1 ? 's' : ''),
                value: !options.entries?.winnersUserId.length ? inlineCode('none') : options.entries.winnersUserId.map(id => `${userMention(id)} ${inlineCode(id)}`).join('\n')
            });
        }

        return embed;
    }

    public static async selectWinnerEntries(entries: RawGiveawayEntry[], needed: number): Promise<RawGiveawayEntry[]> {
        const shuffled = entries.sort(() => Math.random() - 0.5);
        const winners: RawGiveawayEntry[] = [];

        for (const entry of shuffled) {
            if (winners.some(w => w.userId === entry.userId)) continue;

            winners.push(entry);
            if (winners.length >= needed) break;
        }

        return winners;
    }

    public readonly database: Database;
    public readonly client: Client;
    public readonly joinButton: GiveawayManagerButtonOptions = GiveawayManager.joinButton;
    public readonly maxTimeoutMs: number = 2147483648;
    public readonly giveawayTimeouts: Collection<string, { giveawayId: string; timeout: NodeJS.Timeout; }> = new Collection();

    public createEmbed: (data: GiveawayManagerCreateGiveawayEmbedOptions) => Awaitable<JSONEncodable<APIEmbed>|APIEmbed> = GiveawayManager.createEmbed;
    public onBeforeHandleInteraction?: (interaction: ButtonInteraction) => Awaitable<boolean>;
    public selectWinnerEntries: (entries: RawGiveawayEntry[], needed: number) => Awaitable<RawGiveawayEntry[]> = GiveawayManager.selectWinnerEntries;

    public ready: boolean = false;

    private eventHandler: GiveawayManagerEventHandler = new GiveawayManagerEventHandler(this);

    constructor(options: GiveawayManagerOptions<Database>) {
        super();

        this.database = options.database;
        this.client = options.client;
        this.joinButton = options.joinButtonData ?? this.joinButton;
        this.maxTimeoutMs = options.maxTimeoutMs ?? this.maxTimeoutMs;
        this.createEmbed = options.createEmbed ?? GiveawayManager.createEmbed;
        this.onBeforeHandleInteraction = options.onBeforeHandleInteraction;
        this.selectWinnerEntries = options.selectWinnerEntries ?? GiveawayManager.selectWinnerEntries;
    }

    public async start(): Promise<void> {
        if (!this.client.isReady()) throw new GiveawayManagerError('Discord.js client is not yet ready or logged in');
        if (this.ready) throw new GiveawayManagerError('Giveaway manager is already ready');

        await this.database.start(this);
        this.database.on('error', this._err);
        this.client.on('guildDelete', this.eventHandler.guildDelete);
        this.client.on('channelDelete', this.eventHandler.channelDelete);
        this.client.on('messageDelete', this.eventHandler.messageDelete);
        this.client.on('messageDeleteBulk', this.eventHandler.messageDeleteBulk);
        this.client.on('interactionCreate', this.eventHandler.interactionCreate);

        this.ready = true;

        const giveaways = await this.database.fetchGiveaways({ filter: { ended: false, paused: false } });

        for (const giveaway of giveaways) {
            await this.createGiveawayTimeout(giveaway.id, giveaway.dueDate).catch(err => this.emit(err));
        }
    }

    public async destroy(): Promise<void> {
        if (!this.ready) throw new GiveawayManagerError('Giveaway manager is not ready');

        this.database.removeListener('error', this._err);
        this.client.removeListener('guildDelete', this.eventHandler.guildDelete);
        this.client.removeListener('channelDelete', this.eventHandler.channelDelete);
        this.client.removeListener('messageDelete', this.eventHandler.messageDelete);
        this.client.removeListener('messageDeleteBulk', this.eventHandler.messageDeleteBulk);
        this.client.removeListener('interactionCreate', this.eventHandler.interactionCreate);

        await this.database.destroy();

        for (const giveaway of this.giveawayTimeouts.values()) {
            clearTimeout(giveaway.timeout);
        }

        this.giveawayTimeouts.clear();
        this.ready = false;
    }

    public async createGiveaway(options: GiveawayManagerCreateGiveawayOptions): Promise<RawGiveaway> {
        if (!this.ready) throw new GiveawayManagerError('Giveaway manager is not ready');
        if (typeof options.endsAt === 'number' && (Number.isNaN(options.endsAt) || !Number.isFinite(options.endsAt) || options.endsAt <= 0)) throw new GiveawayManagerError('Giveaway duration must be a positive integer');

        const createdAt = new Date();
        const dueDate = typeof options.endsAt === 'number' ? new Date(Date.now() + options.endsAt) : options.endsAt;
        const duration = typeof options.endsAt === 'number' ? options.endsAt : options.endsAt.getTime() - Date.now();

        const partialGiveaway: GiveawayManagerCreateGiveawayMessageOptions['giveaway'] = {
            hostId: options.hostId,
            name: options.name,
            description: options.description,
            winnerCount: options.winnerCount ?? 1,
            createdAt,
            paused: false,
            remaining: duration,
            ended: false,
            dueDate,
            riggedUsersId: options.riggedUsersId,
            winnersEntryId: []
        };

        const message = await options.channel.send({
            ...await this.createGiveawayMessageData({ giveaway: partialGiveaway }),
            ...(options.content ? { content: options.content } : {})
        });

        const giveaway = await this.database.createGiveaway({
            ...partialGiveaway,
            guildId: message.guildId,
            channelId: message.channelId,
            messageId: message.id
        }).catch(err => {
            message.delete().catch(() => null);
            throw err;
        });

        this.createGiveawayTimeout(giveaway.id, dueDate);
        this.emit('giveawayCreate', giveaway);
        return giveaway;
    }

    public async pauseGiveaway(id: string): Promise<RawGiveaway> {
        if (!this.ready) throw new GiveawayManagerError('Giveaway manager is not ready');

        const giveaway = (await this.database.fetchGiveaways({ filter: { id } }))[0];
        if (!giveaway) throw new GiveawayManagerError('Giveaway not found');
        if (giveaway.ended) throw new GiveawayManagerError('Giveaway is already ended');
        if (giveaway.paused) return giveaway;

        this.deleteGiveawayTimeout(id);

        const newGiveaway = (await this.database.updateGiveaways({ filter: { id } }, {
            paused: true,
            remaining: giveaway.dueDate.getTime() - Date.now()
        }))[0];

        const message = await this.fetchGiveawayMessage(giveaway);
        await message.edit(await this.createGiveawayMessageData({ giveaway: newGiveaway, entries: await this.fetchGiveawayEntries(giveaway.id) }));
        return newGiveaway;
    }

    public async resumeGiveaway(id: string): Promise<RawGiveaway> {
        if (!this.ready) throw new GiveawayManagerError('Giveaway manager is not ready');

        const giveaway = (await this.database.fetchGiveaways({ filter: { id } }))[0];
        if (!giveaway) throw new GiveawayManagerError('Giveaway not found');
        if (giveaway.ended) throw new GiveawayManagerError('Giveaway is already ended');
        if (!giveaway.paused || !giveaway.remaining) return giveaway;

        const newGiveaway = (await this.database.updateGiveaways({ filter: { id} }, {
            paused: false,
            dueDate: new Date(Date.now() + giveaway.remaining),
            remaining: 0
        }))[0];

        const message = await this.fetchGiveawayMessage(giveaway);
        await message.edit(await this.createGiveawayMessageData({ giveaway: newGiveaway, entries: await this.fetchGiveawayEntries(giveaway.id) }));

        this.createGiveawayTimeout(id, newGiveaway.dueDate);
        return newGiveaway;
    }

    public async endGiveaway(id: string, cancel: boolean = false): Promise<GiveawayManagerEntriesData|null> {
        if (!this.ready) throw new GiveawayManagerError('Giveaway manager is not ready');

        this.deleteGiveawayTimeout(id);

        const giveaway = (await this.database.fetchGiveaways({ filter: { id } }))[0];
        if (!giveaway) throw new GiveawayManagerError('Giveaway not found');

        const entries: GiveawayManagerEntriesData = cancel !== true
            ? await this.selectGiveawayEntries(id)
            : {
                allEntries: await this.database.fetchGiveawayEntries({ filter: { giveawayId: id } }),
                riggedUsersId: giveaway.riggedUsersId ?? [],
                selectedEntries: [],
                winnersUserId: []
            };

        const message = await this.fetchGiveawayMessage(giveaway);
        if (!message) {
            this.database.deleteGiveaways({ filter: { id } });
            throw new GiveawayManagerError('Giveaway message not found');
        }

        const endedGiveaway = (await this.database.updateGiveaways({ filter: { id } }, {
            ended: true,
            dueDate: new Date(),
            remaining: 0,
            paused: false,
            winnersEntryId: entries.winnersUserId
        }))[0];

        this.emit('giveawayEnd', endedGiveaway, entries);

        await message.edit(await this.createGiveawayMessageData({
            giveaway: endedGiveaway,
            entries
        }));

        return cancel ? null : entries;
    }

    public async deleteGiveaway(id: string, deleteMessage: boolean = true): Promise<void> {
        if (!this.ready) throw new GiveawayManagerError('Giveaway manager is not ready');

        const giveaway = (await this.database.deleteGiveaways({ filter: { id } }))[0];
        if (!giveaway) return;

        this.deleteGiveawayTimeout(id);
        this.emit('giveawayDelete', giveaway);

        const message = await this.fetchGiveawayMessage(giveaway).catch(() => null);
        if (!message) return;

        if (deleteMessage) await message.delete();
    }

    public async toggleUserEntry(giveawayId: string, userId: string, updateMessage: boolean = true): Promise<RawGiveawayEntry|null> {
        if (!this.ready) throw new GiveawayManagerError('Giveaway manager is not ready');

        let entries = await this.database.fetchGiveawayEntries({ filter: { giveawayId } });
        let entry = entries.find(e => e.userId === userId) ?? null;

        if (entry) {
            await this.database.deleteGiveawayEntries({ filter: { id: entry.id } });
            entries = entries.filter(e => entry?.id !== e.id);

            this.emit('giveawayEntryDelete', entry, giveawayId);
            entry = null;
        } else {
            entry = await this.database.createGiveawayEntry({
                createdAt: new Date(),
                giveawayId,
                chance: 1,
                userId
            });

            entries.push(entry);
            this.emit('giveawayEntryAdd', entry, giveawayId);
        }

        if (updateMessage) {
            const giveaway = (await this.database.fetchGiveaways({ filter: { id: giveawayId } }))[0];
            if (!giveaway) throw new GiveawayManagerError(`Giveaway id not found: ${giveawayId}`)

            const message = await this.fetchGiveawayMessage(giveaway);
            if (!message) {
                await this.database.deleteGiveaways({ filter: { id: giveawayId } });
                throw new GiveawayManagerError(`Giveaway message not found!`);
            }

            await message.edit(await this.createGiveawayMessageData({ giveaway, entries: await this.fetchGiveawayEntries(giveawayId) }));
        }

        return entry;
    }

    public async createGiveawayMessageData(options: GiveawayManagerCreateGiveawayMessageOptions): Promise<BaseMessageOptions> {
        const allWinners: string[] = options.entries?.winnersUserId ?? [];

        const embed = await Promise.resolve(this.createEmbed({
            manager: this,
            giveaway: options.giveaway,
            entries: options.entries
        }));

        return {
            content: options.giveaway.ended
            ? allWinners.length
                ? inlineCode('🎉') + allWinners.map((id, i) => userMention(id)).join(' ') + ' won the giveaway!'
                : ' '
            : undefined,
            embeds: [embed],
            components: [
                {
                    type: ComponentType.ActionRow,
                    components: [
                        {
                            type: ComponentType.Button,
                            ...this.joinButton,
                            style: ButtonStyle.Primary,
                            disabled: options.giveaway.ended || options.giveaway.paused
                        }
                    ]
                }
            ]
        };
    }

    public async selectGiveawayEntries(giveawayId: string, options?: GiveawayManagerSelectGiveawayEntriesOptions): Promise<GiveawayManagerEntriesData> {
        if (!this.ready) throw new GiveawayManagerError('Giveaway manager is not ready');

        const giveaway = (await this.database.fetchGiveaways({ filter: { id: giveawayId } }))[0];
        if (!giveaway) throw new GiveawayManagerError('Giveaway not found');

        let winnerCount = options?.winnerCount ?? giveaway.winnerCount;

        const allEntries = await this.database.fetchGiveawayEntries({ filter: { giveawayId } });
        const riggedUsersId = giveaway.riggedUsersId ?? [];
        const filteredEntries = allEntries.filter(entry => !riggedUsersId.includes(entry.userId) && !options?.ignoredUsersId?.includes(entry.userId));

        let winnersUserId: string[] = [];

        if (options?.rigged !== false) winnersUserId.push(...riggedUsersId);

        if (winnersUserId.length < winnerCount || options?.countRiggedUsers === false) {
            const selected = await Promise.resolve(this.selectWinnerEntries(filteredEntries, winnerCount - winnersUserId.length));
            winnersUserId.push(...selected.map(entry => entry.userId));
        }

        const selectedEntries = filteredEntries.filter(entry => winnersUserId.includes(entry.userId));

        return {
            allEntries,
            riggedUsersId,
            selectedEntries,
            winnersUserId: this.sortSnowflakeToNewest(winnersUserId)
        };
    }

    public async fetchGiveawayEntries(giveawayId: string): Promise<GiveawayManagerEntriesData> {
        const giveaway = (await this.database.fetchGiveaways({ filter: { id: giveawayId } }))[0];
        if (!giveaway) throw new GiveawayManagerError('Giveaway not found');

        const allEntries = await this.database.fetchGiveawayEntries({ filter: { giveawayId } });
        const selectedEntries = allEntries.filter(e => giveaway.winnersEntryId.includes(e.id));

        let winnersUserId = selectedEntries.map(e => e.userId);
        if (giveaway.riggedUsersId) winnersUserId.push(...giveaway.riggedUsersId);

        return {
            allEntries,
            riggedUsersId: giveaway.riggedUsersId ?? [],
            selectedEntries,
            winnersUserId: this.sortSnowflakeToNewest(winnersUserId)
        };
    }

    public async fetchGiveawayMessage(giveaway: string|Pick<RawGiveaway, 'channelId'|'messageId'>): Promise<Message<true>> {
        giveaway = typeof giveaway === 'string' ? (await this.database.fetchGiveaways({ filter: { id: giveaway } }))[0] : giveaway;

        const channel = await this.client.channels.fetch(giveaway.channelId) as GuildTextBasedChannel;

        return channel.messages.fetch(giveaway.messageId);
    }

    public async clean(giveaways?: RawGiveaway[]): Promise<void> {
        if (!this.ready) throw new GiveawayManagerError('Giveaway manager is not ready');

        giveaways ??= await this.database.fetchGiveaways({});

        for (const giveaway of giveaways) {
            const message = await this.fetchGiveawayMessage(giveaway);
            if (message) continue;

            await this.deleteGiveaway(giveaway.id);
        }
    }

    protected async createGiveawayTimeout(giveawayId: string, endsAt: Date|number): Promise<void> {
        endsAt = typeof endsAt === 'number' ? new Date(Date.now() + endsAt) : endsAt;

        if (endsAt.getTime() <= Date.now()) {
            this.endGiveaway(giveawayId);
            return;
        }

        let duration: number = endsAt.getTime() - Date.now();
        let timeout: NodeJS.Timeout;

        if (duration > this.maxTimeoutMs) {
            timeout = setTimeout(() => this.createGiveawayTimeout(giveawayId, duration - this.maxTimeoutMs), this.maxTimeoutMs).unref();
        } else {
            timeout = setTimeout(() => this.endGiveaway(giveawayId).catch(err => this.emit('error', err)), duration).unref();
        }

        this.giveawayTimeouts.set(giveawayId, { giveawayId, timeout });
    }

    protected deleteGiveawayTimeout(giveawayId: string): void {
        const timeout = this.giveawayTimeouts.get(giveawayId);
        if (timeout) {
            clearTimeout(timeout.timeout);
            this.giveawayTimeouts.delete(giveawayId);
        }
    }

    private _err(err: Error): void {
        this.emit('error', err);
    }

    private sortSnowflakeToNewest(snowflakes: string[]): string[] {
        const record: Collection<string, Date> = new Collection();

        for (const snowflake of snowflakes) {
            const bigint = BigInt(snowflake) >> 22n;
            const date = new Date(Number(bigint) + 1420070400000);
            record.set(snowflake, date);
        }

        return Array.from(record.sort((a, b) => b.getTime() - a.getTime()).keys());
    }
}