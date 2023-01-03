import { Awaitable, If, IntentsBitField, JSONEncodable, Message, MessageReaction, normalizeArray, parseEmoji, ReactionCollector, ReactionCollectorOptions, RepliableInteraction, RestOrArray } from 'discord.js';
import { getEnumValue, PaginationControllerType, SendAs } from '../../index';
import { RawReaction, Reaction, ReactionsOnDisable } from '../../types/reactions';
import { BasePagination, BasePaginationData, BasePaginationEvents } from '../BasePagination';

export interface ReactionPaginationData extends BasePaginationData {
    reactions?: (Reaction|RawReaction)[];
    onDisable?: ReactionsOnDisable|keyof typeof ReactionsOnDisable;
    singlePageNoReactions?: boolean;
    collectorOptions?: Omit<ReactionCollectorOptions, 'time'>;
}

export interface ReactionPaginationEvents extends BasePaginationEvents<MessageReaction> {
    'reactionAdd': [reaction: MessageReaction, controller: Reaction];
}

export interface ReactionPaginationBuilder<Sent extends boolean = boolean> extends BasePagination<MessageReaction, Sent> {
    on<E extends keyof ReactionPaginationEvents>(event: E, listener: (...args: ReactionPaginationEvents[E]) => Awaitable<void>): this;
    on<E extends string|symbol>(event: Exclude<E, keyof ReactionPaginationEvents>, listener: (...args: any) => Awaitable<void>): this;

    once<E extends keyof ReactionPaginationEvents>(event: E, listener: (...args: ReactionPaginationEvents[E]) => Awaitable<void>): this;
    once<E extends string|symbol>(event: Exclude<E, keyof ReactionPaginationEvents>, listener: (...args: any) => Awaitable<void>): this;


    emit<E extends keyof ReactionPaginationEvents>(event: E, ...args: ReactionPaginationEvents[E]): boolean;
    emit<E extends string|symbol>(event: Exclude<E, keyof ReactionPaginationEvents>, ...args: any): boolean;

    off<E extends keyof ReactionPaginationEvents>(event: E, listener: (...args: ReactionPaginationEvents[E]) => Awaitable<void>): this;
    off<E extends string|symbol>(event: Exclude<E, keyof ReactionPaginationEvents>, listener: (...args: any) => Awaitable<void>): this;

    removeAllListeners<E extends keyof ReactionPaginationEvents>(event?: E): this;
    removeAllListeners(event?: string|symbol): this;
}

export class ReactionPaginationBuilder<Sent extends boolean = boolean> extends BasePagination<MessageReaction, Sent> {
    protected _reactions: Reaction[] = [];
    protected _onDisable: ReactionsOnDisable = ReactionsOnDisable.ClearPaginationReactions;
    protected _singlePageNoReactions: boolean = true;
    protected _collector: ReactionCollector|null = null;
    protected _collectorOptions?: Omit<ReactionCollectorOptions, 'time'>;

    get reactions() { return this._reactions; }
    get onDisable() { return this._onDisable; }
    get singlePageNoReactions() { return this._singlePageNoReactions; }
    get collector() { return this._collector as If<Sent, ReactionCollector>; }
    get collectorOptions() { return this._collectorOptions; }

    constructor(options?: ReactionPaginationData|JSONEncodable<ReactionPaginationData>) {
        options = (options as ReactionPaginationBuilder).toJSON !== undefined
            ? (options as ReactionPaginationBuilder).toJSON()
            : options as ReactionPaginationData;

        super(options);

        this.setReactions(...(options.reactions ?? []));
        this.setOnDisable(options.onDisable ?? this.onDisable);
        this.setSinglePageNoReactions(options.singlePageNoReactions ?? this.singlePageNoReactions);
    }

    /**
     * Add reaction controller to pagination
     * @param emoji Emoji resolvable
     * @param type Controller type
     */
    public addReaction(emoji: string, type: PaginationControllerType|keyof typeof PaginationControllerType): this {
        this._reactions.push(ReactionPaginationBuilder.parseReaction({ emoji, type }));
        return this;
    }

    /**
     * Replace all reaction controllers in pagination
     * @param reactions Reaction controllers
     */
    public setReactions(...reactions: RestOrArray<Reaction|RawReaction>): this {
        this._reactions = normalizeArray(reactions).map(r => ReactionPaginationBuilder.parseReaction(r));
        return this;
    }

    /**
     * Action on disable
     * @param onDisable on disable action
     */
    public setOnDisable(onDisable: ReactionsOnDisable|keyof typeof ReactionsOnDisable): this {
        this._onDisable = getEnumValue(ReactionsOnDisable, onDisable);
        return this;
    }

    /**
     * Disable reaction controllers on single page pagination
     * @param singlePageNoReactions single page no reactions
     */
    public setSinglePageNoReactions(singlePageNoReactions: boolean): this {
        this._singlePageNoReactions = !!singlePageNoReactions;
        return this;
    }

    /**
     * Custom collector options
     * @param collectorOptions collector options
     */
    public setCollectorOptions(collectorOptions: Omit<ReactionCollectorOptions, 'time'>): this {
        this._collectorOptions = collectorOptions;
        return this;
    }

    public async paginate(command: Message|RepliableInteraction, sendAs: SendAs|keyof typeof SendAs = SendAs.ReplyMessage): Promise<ReactionPaginationBuilder<true>> {
        if (this.isSent()) throw new Error(`Pagination is already sent`);
        if (!this.pages.length) throw new Error(`Pagination does not have any pages`);
        if (!new IntentsBitField(command.client.options.intents).has("GuildMessageReactions")) throw new Error("Missing intent 'GuildMessageReactions'");

        this._command = command;

        const page = await this.currentPage;

        if (!(command instanceof Message) && (command.ephemeral === true || command.ephemeral === null && page?.ephemeral)) throw new Error("Reactions cannot be added to ephemeral messages");

        await this._sendPage(page!, getEnumValue(SendAs, sendAs));
        await this._react();

        this.emit('ready');
        this._addCollector();

        return this as ReactionPaginationBuilder<true>;
    }

    public isSent(): this is ReactionPaginationBuilder<true> {
        return super.isSent();
    }

    public toJSON(): ReactionPaginationData {
        return {
            ...super.toJSON(),
            reactions: this.reactions,
            onDisable: this.onDisable,
            singlePageNoReactions: this.singlePageNoReactions,
            collectorOptions: this.collectorOptions
        };
    }

    protected _addCollector(): void {
        if (!this.isSent()) throw new Error(`Pagination is not ready`);

        this._collector = this.pagination.createReactionCollector({
            ...this.collectorOptions,
            time: this.timer
        });

        this.collector.on('collect', async (reaction, user) => {
            this.emit('collect', reaction);

            if (this.authorDependent && this.authorId && this.authorId !== user.id) return;

            const controller = this.reactions.find(b => (reaction.emoji.id ?? null) === b.id && (reaction.emoji.name ?? null) === b.name);
            if (!controller) return;

            switch (controller.type) {
                case PaginationControllerType.FirstPage:
                    await this.setCurrentPage(0).catch(() => {});
                    break;
                case PaginationControllerType.PreviousPage:
                    this.setCurrentPage(this.previousPageIndex).catch(() => {});
                    break;
                case PaginationControllerType.NextPage:
                    this.setCurrentPage(this.nextPageIndex).catch(() => {});
                    break;
                case PaginationControllerType.LastPage:
                    await this.setCurrentPage(this.pages.length - 1).catch(() => {});
                    break;
                case PaginationControllerType.Stop:
                    this._collector?.stop('PaginationEnded');
                    break;
            }

            this.emit('reactionAdd', reaction, controller);
            this._collector?.resetTimer();
            reaction.users.remove(user).catch(() => {});
        });

        this.collector.on('end', async (collected, reason) => {
            this.emit('end', reason);

            switch(this.onDisable) {
                case ReactionsOnDisable.ClearAllReactions:
                    await this.pagination?.reactions.removeAll().catch(() => {});
                    break;
                case ReactionsOnDisable.ClearPaginationReactions:
                    for (const reaction of this.pagination?.reactions.cache.filter(r => r.me).toJSON() ?? []) {
                        await reaction.remove().catch(() => {});
                    }
                    break;
                case ReactionsOnDisable.DeletePagination:
                    if (this.pagination?.deletable) await this.pagination.delete().catch(() => {});
                    break;
            }
        });
    }

    protected async _react(): Promise<void> {
        if (!this.isSent()) throw new TypeError("Pagination is not yet ready");
        if (this.pages.length <= 1 && this.singlePageNoReactions) return;

        for (const emojiData of this._reactions) {
            const emoji = emojiData.id === null ? emojiData.name : this.pagination.client.emojis.cache.get(emojiData.id);

            if (!emoji) throw new Error("Could not find emoji cache for " + emojiData.id ?? emojiData.name);
            await this.pagination.react(emoji);
        }
    }

    public static parseReaction(reaction: Reaction|RawReaction): Reaction {
        if ((reaction as Reaction)?.id !== undefined || (reaction as Reaction)?.name !== undefined) return reaction as Reaction;

        const parsedEmoji = parseEmoji((reaction as RawReaction).emoji);
        if (!parsedEmoji?.id && !parsedEmoji?.name || !parsedEmoji?.name || parsedEmoji.animated && !parsedEmoji.id) throw new Error(`Couldn't parse emoji`);

        return {
            id: parsedEmoji.id ?? null,
            name: parsedEmoji.name,
            type: getEnumValue(PaginationControllerType, reaction.type)
        };
    }
}