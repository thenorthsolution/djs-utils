import { ReactionPaginationOnEnd, ReactionPaginationReactionController, ReactionPaginationReactionControllerResolvable, resolveReactionController } from '../types/reactions';
import { EmojiResolvable, If, IntentsBitField, Message, MessageReaction, ReactionCollector, ReactionCollectorOptions, RestOrArray, normalizeArray } from 'discord.js';
import { BasePaginationBuilder, BasePaginationEvents, BasePaginationOptions } from './BasePaginationBuilder';
import { PaginationActionRows, PaginationControllerType, SendAs, getEnumValue } from '../types/enums';
import { InteractionPaginationSendOptions, MessagePaginationSendOptions } from '../types/send';
import { PaginationComponentsOrderWithoutControllers } from '../types/page';

export interface ReactionPaginationOptions extends BasePaginationOptions {
    reactions: (ReactionPaginationReactionControllerResolvable|ReactionPaginationReactionController)[];
    onEnd: (keyof typeof ReactionPaginationOnEnd)|ReactionPaginationOnEnd;
    collectorOptions: Omit<ReactionCollectorOptions, 'time'>;
    removeReactionOnReact: boolean;
    componentsOrder: PaginationComponentsOrderWithoutControllers;
}

export interface ReactionPaginationEvents extends BasePaginationEvents<MessageReaction> {
    'controllerReactionAdd': [reaction: MessageReaction, controller: ReactionPaginationReactionController];
    'controllerReactionRemove': [reaction: MessageReaction, controller: ReactionPaginationReactionController];
}

export class ReactionPaginationBuilder<Sent extends boolean = boolean> extends BasePaginationBuilder<MessageReaction, ReactionPaginationEvents, Sent> implements ReactionPaginationOptions {
    public reactions: ReactionPaginationReactionController[] = [];
    public onEnd: (keyof typeof ReactionPaginationOnEnd)|ReactionPaginationOnEnd = ReactionPaginationOnEnd.Ignore;
    public collectorOptions: Omit<ReactionCollectorOptions, 'time'> = {};
    public removeReactionOnReact: boolean = true;
    public componentsOrder: PaginationComponentsOrderWithoutControllers = [PaginationActionRows.PageActionRows, PaginationActionRows.AdditionalActionRows];

    protected _collector: ReactionCollector|null = null;

    get collector() { return this._collector as If<Sent, ReactionCollector>; }

    constructor(options?: Partial<ReactionPaginationOptions>) {
        super(options);

        if (options?.reactions) this.setReactions(options.reactions);
        if (options?.onEnd) this.setOnEnd(options.onEnd);
        if (typeof options?.removeReactionOnReact === 'boolean') this.setRemoveReactionOnReact(options.removeReactionOnReact);
    }

    public addReaction(emoji: EmojiResolvable, type: (keyof typeof PaginationControllerType)|PaginationControllerType): this {
        this.reactions.push(resolveReactionController({ emoji, type }));
        return this;
    }

    public addReactions(...reactions: RestOrArray<ReactionPaginationReactionControllerResolvable|ReactionPaginationReactionController>): this {
        this.reactions.push(...normalizeArray(reactions).map(r => resolveReactionController(r)));
        return this;
    }

    public setReactions(...reactions: RestOrArray<ReactionPaginationReactionControllerResolvable|ReactionPaginationReactionController>): this {
        this.reactions = normalizeArray(reactions).map(r => resolveReactionController(r));
        return this;
    }

    public setOnEnd(onEnd: (keyof typeof ReactionPaginationOnEnd)|ReactionPaginationOnEnd): this {
        this.onEnd = getEnumValue(ReactionPaginationOnEnd, onEnd);
        return this;
    }

    public setRemoveReactionOnReact(removeReactionOnReact: boolean): this {
        this.removeReactionOnReact = !!removeReactionOnReact;
        return this;
    }

    public async send(options: InteractionPaginationSendOptions|MessagePaginationSendOptions): Promise<ReactionPaginationBuilder<true>> {
        if (this.isSent()) throw new Error(`Pagination is already sent`);
        if (!this.pages.length) throw new Error(`Pagination does not have any pages`);
        if (!options.command.client.options.intents.has(IntentsBitField.Flags.GuildMessageReactions)) throw new Error("Missing intent GuildMessageReactions");

        this._command = options.command;

        const page = await this.currentPage;
        const followUp = !(options.command instanceof Message) ? (options as InteractionPaginationSendOptions)?.followUp : undefined;

        if (!(this._command instanceof Message) && (!followUp && this._command.ephemeral === true || page?.ephemeral)) throw new Error("Reactions cannot be added to ephemeral messages");

        await this._sendInitialPage(page!, getEnumValue(SendAs, options.sendAs), followUp);
        await this._react();

        this.emit('ready');
        this._addCollector();

        return this as ReactionPaginationBuilder<true>;
    }

    public isSent(): this is ReactionPaginationBuilder<true> {
        return super.isSent();
    }

    public toJSON(): ReactionPaginationOptions {
        return {
            ...super.toJSON(),
            reactions: this.reactions,
            onEnd: this.onEnd,
            collectorOptions: this.collectorOptions,
            removeReactionOnReact: this.removeReactionOnReact,
            componentsOrder: this.componentsOrder
        };
    }

    protected async _react(): Promise<void> {
        if (!this.isSent()) throw new TypeError("Pagination is not yet ready");
        if (this.pages.length <= 1 && this.singlePageNoControllers) return;

        for (const emojiData of this.reactions) {
            const emoji = emojiData.id === null ? emojiData.name : this.pagination.client.emojis.resolve(emojiData.id);

            if (!emoji) throw new Error("Could not find emoji " + emojiData.id ?? emojiData.name);
            await this.pagination.react(emoji);
        }
    }

    protected async _addCollector(): Promise<void> {
        if (!this.isSent()) throw new Error(`Pagination is not ready`);

        this._collector = this.pagination.createReactionCollector({
            ...this.collectorOptions,
            time: this.endTimer ?? undefined
        });

        this.collector.on('collect', async (reaction, user) => {
            this.emit('collect', reaction);
            if (this.authorDependent && this.authorId && this.authorId !== user.id) return;

            const controller = this.reactions.find(b => (reaction.emoji.id ?? null) === b.id && (reaction.emoji.name ?? null) === b.name);
            if (!controller) return;

            switch (controller.type) {
                case PaginationControllerType.FirstPage:
                    await this.setCurrentPageIndex(0).catch(err => this.emit('error', err));
                    break;
                case PaginationControllerType.PreviousPage:
                    await this.setCurrentPageIndex(this.previousPageIndex).catch(err => this.emit('error', err));
                    break;
                case PaginationControllerType.NextPage:
                    await this.setCurrentPageIndex(this.nextPageIndex).catch(err => this.emit('error', err));
                    break;
                case PaginationControllerType.LastPage:
                    await this.setCurrentPageIndex(this.pages.length - 1).catch(err => this.emit('error', err));
                    break;
                case PaginationControllerType.Stop:
                    this.collector?.stop('PaginationEnd');
                    break;
            }

            this.emit('controllerReactionAdd', reaction, controller);
            this.collector?.resetTimer();

            if (this.removeReactionOnReact) await reaction.users.remove(user).catch(err => this.emit('error', err));
        });

        this.collector.on('dispose', reaction => {
            const controller = this.reactions.find(b => (reaction.emoji.id ?? null) === b.id && (reaction.emoji.name ?? null) === b.name);
            if (!controller) return;

            this.emit('controllerReactionRemove', reaction, controller);
        });

        this.collector.on('end', async (collected, reason) => {
            this.emit('end', reason);

            switch(this.onEnd) {
                case ReactionPaginationOnEnd.ClearAllReactions:
                    await this.pagination?.reactions.removeAll().catch(err => this.emit('error', err));
                    break;
                case ReactionPaginationOnEnd.ClearPaginationReactions:
                    for (const reaction of this.pagination?.reactions.cache.filter(r => r.me).toJSON() ?? []) {
                        await reaction.remove().catch(err => this.emit('error', err));
                    }
                    break;
                case ReactionPaginationOnEnd.DeletePagination:
                    if (this.pagination?.deletable) await this.pagination.delete().catch(err => this.emit('error', err));
                    break;
                case ReactionPaginationOnEnd.Ignore: break;
            }
        });
    }
}