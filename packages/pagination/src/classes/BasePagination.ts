import { ActionRowBuilder, ActionRowData, Awaitable, If, JSONEncodable, Message, MessageActionRowComponent, MessageActionRowComponentBuilder, MessageActionRowComponentData, normalizeArray, RepliableInteraction, RestOrArray, UserResolvable } from 'discord.js';
import EventEmitter from 'events';
import { DynamicPageFunction, PageData, PageResolvable, resolvePage } from '../types/page';
import { SendAs } from '../types/enums';

export interface BasePaginationData {
    pages?: PageResolvable[];
    authorDependent?: boolean;
    authorId?: UserResolvable|null;
    currentPageIndex?: number;
    timer?: number;
    components?: (ActionRowData<MessageActionRowComponent|MessageActionRowComponentData>|ActionRowBuilder<MessageActionRowComponentBuilder>)[];
}

export interface BasePaginationEvents<Collected> {
    ready: [];
    pageChange: [page: PageData, index: number];
    collect: [collected: Collected];
    end: [reason: string];
}

export interface BasePagination<Collected, Sent extends boolean = boolean> extends EventEmitter {
    on<E extends keyof BasePaginationEvents<Collected>>(event: E, listener: (...args: BasePaginationEvents<Collected>[E]) => Awaitable<void>): this;
    on<E extends string|symbol>(event: Exclude<E, keyof BasePaginationEvents<Collected>>, listener: (...args: any) => Awaitable<void>): this;

    once<E extends keyof BasePaginationEvents<Collected>>(event: E, listener: (...args: BasePaginationEvents<Collected>[E]) => Awaitable<void>): this;
    once<E extends string|symbol>(event: Exclude<E, keyof BasePaginationEvents<Collected>>, listener: (...args: any) => Awaitable<void>): this;


    emit<E extends keyof BasePaginationEvents<Collected>>(event: E, ...args: BasePaginationEvents<Collected>[E]): boolean;
    emit<E extends string|symbol>(event: Exclude<E, keyof BasePaginationEvents<Collected>>, ...args: any): boolean;

    off<E extends keyof BasePaginationEvents<Collected>>(event: E, listener: (...args: BasePaginationEvents<Collected>[E]) => Awaitable<void>): this;
    off<E extends string|symbol>(event: Exclude<E, keyof BasePaginationEvents<Collected>>, listener: (...args: any) => Awaitable<void>): this;

    removeAllListeners<E extends keyof BasePaginationEvents<Collected>>(event?: E): this;
    removeAllListeners(event?: string|symbol): this;
}

export class BasePagination<Collected, Sent extends boolean = boolean> extends EventEmitter {
    protected _pages: (PageData|DynamicPageFunction)[] = [];
    protected _authorId: string|null = null;
    protected _currentPageIndex: number = 0;
    protected _timer: number = 20000;
    protected _pagination: Message|null = null;
    protected _authorDependent: boolean = true;
    protected _command: Message|RepliableInteraction|null = null;
    protected _components: (ActionRowData<MessageActionRowComponent|MessageActionRowComponentData>|ActionRowBuilder<MessageActionRowComponentBuilder>)[] = [];

    protected _paginationComponent: ActionRowData<MessageActionRowComponent|MessageActionRowComponentData>|ActionRowBuilder<MessageActionRowComponentBuilder>|null = null;
    protected _disableAllComponents: boolean = false;
    protected _removeAllComponents: boolean = false;
    protected _removePaginationComponents: boolean = false;

    get pages() { return this._pages; }
    get currentPageIndex() { return this._currentPageIndex; }
    get currentPage() { return this.getPage(this.currentPageIndex); }
    get timer() { return this._timer; }
    get pagination() { return this._pagination as If<Sent, Message>; }
    get authorDependent() { return this._authorDependent; }
    get command() { return this._command as If<Sent, Message|RepliableInteraction>; }
    get components() { return this._components; }

    get previousPageIndex() { return this.currentPageIndex - 1 < 0 ? this.pages.length - 1 : this.currentPageIndex - 1; }
    get nextPageIndex() { return this.currentPageIndex + 1 >= this.pages.length ? 0 : this.currentPageIndex + 1; }

    get authorId(): string|null {
        if (this._authorId) return this._authorId;

        return (this.command instanceof Message ? this.command.author.id : this.command?.user?.id) || null;
    }

    constructor(options?: BasePaginationData|JSONEncodable<BasePaginationData>) {
        super();

        options = (options as BasePagination<Collected>).toJSON !== undefined
            ? (options as BasePagination<Collected>).toJSON()
            : options as BasePaginationData;

        this.setPages(...(options?.pages ?? []));
        this.setAuthorId(options?.authorId);
        this.setAuthorDependent(options.authorDependent ?? this.authorDependent);
        this.setTimer(options?.timer ?? this.timer);

        this._currentPageIndex = options?.currentPageIndex ?? this.currentPageIndex;
    }

    /**
     * Add pages to pagination
     * @param pages array of page data to add
     */
    public addPages(...pages: RestOrArray<PageResolvable>): this {
        this._pages.push(...BasePagination.resolveStaticPages(normalizeArray(pages)));
        return this;
    }

    /**
     * Clear and set pagination pages
     * @param pages array of page data
     */
    public setPages(...pages: RestOrArray<PageResolvable>): this {
        this._pages = BasePagination.resolveStaticPages(normalizeArray(pages));
        return this;
    }

    /**
     * Pagination will only works for command author
     * @param authorDependent set author dependent
     */
    public setAuthorDependent(authorDependent: boolean): this {
        this._authorDependent = !!authorDependent;
        return this;
    }

    /**
     * Set author id
     * @param author author user resolvable
     */
    public setAuthorId(author?: UserResolvable|null): this {
        this._authorId = typeof author === 'string' ? author : author?.id || null;
        return this;
    }

    /**
     * Add action rows to page components
     * @param components action rows
     */
    public addComponents(...components: RestOrArray<ActionRowData<MessageActionRowComponent>|ActionRowBuilder<MessageActionRowComponentBuilder>>): this {
        this._components?.push(...normalizeArray(components).map(c => c instanceof ActionRowBuilder ? c : new ActionRowBuilder<MessageActionRowComponentBuilder>(c)));
        return this;
    }

    /**
     * Set page action rows
     * @param components action rows
     */
    public setComponents(...components: RestOrArray<ActionRowData<MessageActionRowComponent>|ActionRowBuilder<MessageActionRowComponentBuilder>>): this {
        this._components = normalizeArray(components).map(c => c instanceof ActionRowBuilder ? c : new ActionRowBuilder(c));
        return this;
    }

    /**
     * Collector timer
     * @param timer timer in milliseconds
     */
    public setTimer(timer: number): this {
        this._timer = timer;
        return this;
    }

    /**
     * Get page data by index
     * @param pageIndex page index
     */
    public async getPage(pageIndex: number): Promise<PageData|undefined> {
        const page = this.pages.find((p, i) => i === pageIndex);
        const pageData = page ? await resolvePage(page) : undefined;

        if (!pageData) return pageData;

        let components = this._removeAllComponents
            ? []
            : [
                ...(pageData.components ?? []),
                ...this.components,
                ...(
                    this._paginationComponent !== null && !this._removePaginationComponents
                        ? [this._paginationComponent]
                        : []
                    )
            ];

        if (this._disableAllComponents) components = components.map(c => {
            if (c === undefined) return c;

            const actionrow = c instanceof ActionRowBuilder
                ? c
                : new ActionRowBuilder<MessageActionRowComponentBuilder>(c);

            actionrow.components.forEach(c => c.setDisabled(true));

            return actionrow;
        });

        return {
            ...pageData,
            components: [
                ...components
            ]
        }
    }

    /**
     * Check if pagination is sent
     */
    public isSent(): this is BasePagination<Collected, true> {
        return this.command !== null && this.pagination !== null;
    }

    public toJSON(): BasePaginationData {
        return {
            pages: this.pages,
            authorId: this.authorId,
            currentPageIndex: this.currentPageIndex,
        };
    }

    /**
     * Set current pagination page by index
     * @param pageIndex page index
     */
    public async setCurrentPage(pageIndex?: number, editComponentsOnly: boolean = false): Promise<PageData> {
        const page = await (pageIndex !== undefined ? this.getPage(pageIndex) : this.currentPage);
        if (!page) throw new RangeError(`Cannot find page index '${pageIndex}'`);

        this._currentPageIndex = pageIndex ?? this.currentPageIndex;

        if (this.isSent()) {
            if (!(this.command instanceof Message)) {
                await this.command.editReply(!editComponentsOnly ? page : { components: page.components });
            } else {
                await this.pagination.edit(!editComponentsOnly ? page : { components: page.components });
            }

            this.emit('pageChange', (await this.currentPage)!, this.currentPageIndex);
        }

        return page;
    }

    /**
     * Send the pagination message
     * @param page Pagination page
     * @param sendAs Send type
     */
    protected async _sendPage(page: PageData, sendAs: SendAs): Promise<void> {
        if (!this.command) throw new Error(`Pagination command trigger is undefined`);

        switch (sendAs) {
            case SendAs.NewMessage:
                if (!this.command.channel) throw new Error(`Pagination command trigger channel id is null`);
                this._pagination = await this.command.channel.send(page);

                return;
            case SendAs.EditMessage:
                if (this.command instanceof Message) {
                    if (!this.command.editable) throw new Error("Can't edit message command");

                    this._pagination = await this.command.edit(page);
                    return;
                } else {
                    if (!this.command.replied && !this.command.deferred) throw new Error("Interaction is not replied or deferred");

                    this._pagination = await this.command.editReply(page);
                    return;
                }
            case SendAs.ReplyMessage:
                if (this.command instanceof Message) {
                    this._pagination = await this.command.reply(page);
                    return;
                } else {
                    if (this.command.replied || this.command.deferred) throw new Error("Interaction is already replied or deferred");

                    await this.command.reply(page);

                    this._pagination = await this.command.fetchReply();
                    return;
                }
        }
    }

    /**
     * Resolve pagination pages except for dynamic page functions
     * @param pages resolvable pages
     */
    public static resolveStaticPages(...pages: RestOrArray<PageResolvable>): (PageData|DynamicPageFunction)[] {
        return normalizeArray(pages).map(p => typeof p === 'function' ? p : resolvePage(p));
    }

    /**
     * Resolve pagination pages
     * @param pages resolvable pages
     */
    public static async resolvePages(...pages: RestOrArray<PageResolvable>): Promise<PageData[]> {
        return Promise.all(normalizeArray(pages).map(p => resolvePage(p)));
    }
}