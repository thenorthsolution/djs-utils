import { ActionRowBuilder, APIButtonComponentWithCustomId, Awaitable, ButtonBuilder, ButtonInteraction, ButtonStyle, CacheType, If, InteractionButtonComponentData, InteractionCollector, JSONEncodable, MappedInteractionTypes, Message, MessageActionRowComponentBuilder, MessageCollectorOptionsParams, MessageComponentInteraction, MessageComponentType, normalizeArray, RepliableInteraction, RestOrArray } from 'discord.js';
import { Button, ButtonsOnDisable, RawButton } from '../../types/buttons';
import { getEnumValue, PaginationControllerType, SendAs } from '../../types/enums';
import { BasePagination, BasePaginationData, BasePaginationEvents } from '../BasePagination';

export interface ButtonPaginationData extends BasePaginationData {
    buttons?: RawButton[];
    onDisable?: ButtonsOnDisable|keyof typeof ButtonsOnDisable;
    singlePageNoButtons?: boolean;
    collectorOptions?: Omit<MessageCollectorOptionsParams<MessageComponentType>, "time">;
}

export interface ButtonPaginationEvents extends BasePaginationEvents<MessageComponentInteraction> {
    'interactionCreate': [interaction: ButtonInteraction, controller: Button];
}

export interface ButtonPaginationBuilder<Sent extends boolean = boolean> extends BasePagination<MessageComponentInteraction, Sent> {
    on<E extends keyof ButtonPaginationEvents>(event: E, listener: (...args: ButtonPaginationEvents[E]) => Awaitable<void>): this;
    on<E extends string|symbol>(event: Exclude<E, keyof ButtonPaginationEvents>, listener: (...args: any) => Awaitable<void>): this;

    once<E extends keyof ButtonPaginationEvents>(event: E, listener: (...args: ButtonPaginationEvents[E]) => Awaitable<void>): this;
    once<E extends string|symbol>(event: Exclude<E, keyof ButtonPaginationEvents>, listener: (...args: any) => Awaitable<void>): this;


    emit<E extends keyof ButtonPaginationEvents>(event: E, ...args: ButtonPaginationEvents[E]): boolean;
    emit<E extends string|symbol>(event: Exclude<E, keyof ButtonPaginationEvents>, ...args: any): boolean;

    off<E extends keyof ButtonPaginationEvents>(event: E, listener: (...args: ButtonPaginationEvents[E]) => Awaitable<void>): this;
    off<E extends string|symbol>(event: Exclude<E, keyof ButtonPaginationEvents>, listener: (...args: any) => Awaitable<void>): this;

    removeAllListeners<E extends keyof ButtonPaginationEvents>(event?: E): this;
    removeAllListeners(event?: string|symbol): this;
}

export class ButtonPaginationBuilder<Sent extends boolean = boolean> extends BasePagination<MessageComponentInteraction, Sent> {
    protected _buttons: Button[] = [];
    protected _onDisable: ButtonsOnDisable = ButtonsOnDisable.DisableComponents;
    protected _singlePageNoButtons: boolean = true;
    protected _collector: InteractionCollector<MappedInteractionTypes[MessageComponentType]>|null = null;
    protected _collectorOptions?: Omit<MessageCollectorOptionsParams<MessageComponentType>, "time">;

    get buttons() { return this._buttons; }
    get onDisable() { return this._onDisable; }
    get singlePageNoButtons() { return this._singlePageNoButtons; }
    get collector() { return this._collector as If<Sent, InteractionCollector<MappedInteractionTypes[MessageComponentType]>>; }
    get collectorOptions() { return this._collectorOptions; }

    constructor(options?: ButtonPaginationData|JSONEncodable<ButtonPaginationData>) {
        options = (options as ButtonPaginationBuilder).toJSON !== undefined
            ? (options as ButtonPaginationBuilder).toJSON()
            : options as ButtonPaginationData;

        super(options);

        this.setButtons(...(options?.buttons ?? []));
        this.setOnDisable(options?.onDisable ?? this.onDisable);
        this.setSinglePageNoButtons(options?.singlePageNoButtons ?? this.singlePageNoButtons);
        this.setCollectorOptions(options?.collectorOptions ?? this.collectorOptions);
    }

    /**
     * Add button controller to pagination
     * @param button Button data or builder
     * @param type Controller type
     */
    public addButton(button: ButtonBuilder|InteractionButtonComponentData, type: PaginationControllerType|keyof typeof PaginationControllerType): this {
        this._buttons.push(ButtonPaginationBuilder.resolveButton({
            builder: button,
            type
        }));

        return this;
    }

    /**
     * Set button controllers
     * @param buttons Button controllers data
     */
    public setButtons(...buttons: RestOrArray<RawButton>): this {
        this._buttons = normalizeArray(buttons).map(b => ButtonPaginationBuilder.resolveButton(b));
        return this;
    }

    /**
     * Action on disable
     * @param onDisable on disable action
     */
    public setOnDisable(onDisable: ButtonsOnDisable|keyof typeof ButtonsOnDisable): this {
        this._onDisable = getEnumValue(ButtonsOnDisable, onDisable);
        return this;
    }

    /**
     * Disable pagination controllers with single page pagination
     * @param singlePageNoButtons single page no buttons
     */
    public setSinglePageNoButtons(singlePageNoButtons: boolean): this {
        this._singlePageNoButtons = !!singlePageNoButtons;
        return this;
    }

    /**
     * Custom collector options
     * @param collectorOptions collector options
     */
    public setCollectorOptions(collectorOptions?: Omit<MessageCollectorOptionsParams<MessageComponentType>, "time">|null): this {
        this._collectorOptions = collectorOptions || undefined;
        return this;
    }

    public async paginate(command: Message|RepliableInteraction, sendAs: SendAs|keyof typeof SendAs = SendAs.ReplyMessage): Promise<ButtonPaginationBuilder<true>> {
        if (this.isSent()) throw new Error(`Pagination is already sent`);
        if (!this.pages.length) throw new Error(`Pagination does not have any pages`);

        this._command = command;
        this._paginationComponent = new ActionRowBuilder<MessageActionRowComponentBuilder>()
            .setComponents(this.buttons.map(b => b.builder));

        if (this.pages.length <= 1 && this.singlePageNoButtons) this._removePaginationComponents = true;

        await this._sendPage((await this.currentPage)!, getEnumValue(SendAs, sendAs));

        this.emit('ready');
        this._addCollector();

        return this as ButtonPaginationBuilder<true>;
    }

    public isSent(): this is ButtonPaginationBuilder<true> {
        return super.isSent();
    }

    public toJSON(): ButtonPaginationData {
        return {
            ...super.toJSON(),
            buttons: this.buttons,
            onDisable: this.onDisable,
            singlePageNoButtons: this.singlePageNoButtons,
            collectorOptions: this.collectorOptions
        }
    }

    protected _addCollector(): void {
        if (!this.isSent()) throw new Error(`Pagination is not ready`);

        this._collector = this.pagination.createMessageComponentCollector({
            ...this.collectorOptions,
            time: this.timer
        });

        this.collector.on('collect', async component => {
            this.emit('collect', component);

            if (!component.isButton()) return;
            if (this.authorDependent && this.authorId && this.authorId !== component.user.id) return;

            const button = this.buttons.find(b => (b.builder.data as APIButtonComponentWithCustomId).custom_id === component.customId);
            if (!button) return;

            switch (button.type) {
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

            this.emit('interactionCreate', component, button);
            this._collector?.resetTimer();

            if (!component.deferred) await component.deferUpdate().catch(() => {})
        });

        this.collector.on('end', async (collected, reason) => {
            this.emit('end', reason);

            switch (this.onDisable) {
                case ButtonsOnDisable.RemoveComponents:
                    this._removeAllComponents = true;

                    await this.setCurrentPage(undefined, true).catch(() => {});
                    break;
                case ButtonsOnDisable.DisableComponents:
                    this._disableAllComponents = true;

                    await this.setCurrentPage(undefined, true).catch(() => {});
                    break;
                case ButtonsOnDisable.DeletePagination:
                    if (this.command instanceof Message) {
                        await this.pagination?.delete().catch(() => {});
                    } else {
                        await this.command?.deleteReply().catch(() => {});
                    }
                    break;
            }
        });
    }

    public static resolveButton(button: RawButton): Button {
        if (!(button.builder instanceof ButtonBuilder)) button.builder = new ButtonBuilder(button.builder);
        if (button.builder.data.style === ButtonStyle.Link) throw new Error(`Link button is not usable as pagination controller`);

        return {
            builder: button.builder,
            type: getEnumValue(PaginationControllerType, button.type)
        };
    }
}