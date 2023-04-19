import { APIButtonComponentWithCustomId, ActionRowBuilder, ButtonBuilder, ButtonInteraction, If, InteractionButtonComponentData, InteractionCollector, JSONEncodable, MappedInteractionTypes, MessageActionRowComponentBuilder, MessageCollectorOptionsParams, MessageComponentInteraction, MessageComponentType, RestOrArray, normalizeArray } from 'discord.js';
import { BasePaginationBuilder, BasePaginationEvents, BasePaginationOptions } from './BasePaginationBuilder';
import { ButtonPaginationController, ButtonPaginationControllerResolavable, ButtonPaginationOnEnd, resolveButtonBuilder } from '../types/buttons';
import { isJSONEncodable } from 'fallout-utility';
import { PaginationControllerType, SendAs, getEnumValue } from '../types/enums';
import { PageData } from '../types/page';
import { InteractionPaginationSendOptions, MessagePaginationSendOptions } from '../types/send';

export interface ButtonPaginationOptions extends BasePaginationOptions {
    buttons: ButtonPaginationControllerResolavable[];
    onEnd: (keyof typeof ButtonPaginationOnEnd)|ButtonPaginationOnEnd;
    ephemeral: boolean;
    collectorOptions: Omit<MessageCollectorOptionsParams<MessageComponentType>, 'time'>;
    deferUpdateControllerInteraction: boolean;
}

export interface ButtonPaginationEvents extends BasePaginationEvents<MessageComponentInteraction> {
    'controllerInteractionCreate': [interaction: ButtonInteraction, controller: ButtonPaginationController];
}

export class ButtonPaginationBuilder<Sent extends boolean = boolean> extends BasePaginationBuilder<MessageComponentInteraction, ButtonPaginationEvents, Sent> implements ButtonPaginationOptions {
    public buttons: ButtonPaginationController[] = [];
    public onEnd: ButtonPaginationOnEnd = ButtonPaginationOnEnd.DisableComponents;
    public ephemeral: boolean = false;
    public collectorOptions: Omit<MessageCollectorOptionsParams<MessageComponentType>, 'time'> = {};
    public deferUpdateControllerInteraction: boolean = true;

    protected _collector: InteractionCollector<MappedInteractionTypes[MessageComponentType]>|null = null;
    protected _controllerActionRow: ActionRowBuilder<MessageActionRowComponentBuilder> | null = new ActionRowBuilder();

    get collector() { return this._collector as If<Sent, InteractionCollector<MappedInteractionTypes[MessageComponentType]>>; }

    constructor(options?: Partial<ButtonPaginationOptions>|JSONEncodable<ButtonPaginationOptions>) {
        super(options);

        options = isJSONEncodable<BasePaginationOptions>(options) ? options.toJSON() : options;

        if (options?.buttons) this.setButtons(options.buttons);
        if (options?.onEnd) this.setOnEnd(options.onEnd);
        if (typeof options?.ephemeral === 'boolean') this.setEphemeral(options.ephemeral);
    }

    public addButton(button: ButtonBuilder|InteractionButtonComponentData|APIButtonComponentWithCustomId, type: (keyof typeof PaginationControllerType)|PaginationControllerType): this {
        this.buttons.push({ button: resolveButtonBuilder(button), type: getEnumValue(PaginationControllerType, type) });
        return this;
    }

    public addButtons(...buttons: RestOrArray<ButtonPaginationControllerResolavable>): this {
        normalizeArray(buttons).forEach(b => this.addButton(b.button, b.type));
        return this;
    }

    public setButtons(...buttons: RestOrArray<ButtonPaginationControllerResolavable>): this {
        this.buttons = normalizeArray(buttons).map(b => ({ button: resolveButtonBuilder(b.button), type: getEnumValue(PaginationControllerType, b.type) }));
        return this;
    }

    public setOnEnd(onEnd: (keyof typeof ButtonPaginationOnEnd)|ButtonPaginationOnEnd): this {
        this.onEnd = getEnumValue(ButtonPaginationOnEnd, onEnd);
        return this;
    }

    public setEphemeral(isEphemeral: boolean): this {
        this.ephemeral = !!isEphemeral;
        return this;
    }

    public setDeferUpdateControllerInteraction(deferUpdateControllerInteraction: boolean): this {
        this.deferUpdateControllerInteraction = !!deferUpdateControllerInteraction;
        return this;
    }

    public setCollectorOptions(collectorOptions: Omit<MessageCollectorOptionsParams<MessageComponentType>, 'time'>): this {
        return super.setCollectorOptions(collectorOptions);
    }

    public async getPage(pageIndex: number): Promise<(PageData & { ephemeral?: boolean | undefined; }) | undefined> {
        return {
            ...(await super.getPage(pageIndex)),
            ephemeral: this.ephemeral ? true : undefined
        };
    }

    public async send(options: InteractionPaginationSendOptions|MessagePaginationSendOptions): Promise<ButtonPaginationBuilder<true>> {
        if (this.isSent()) throw new Error(`Pagination is already sent`);
        if (!this.pages.length) throw new Error(`Pagination does not have any pages`);

        this._command = options.command;
        this._controllerActionRow = this.buttons.length ? new ActionRowBuilder<MessageActionRowComponentBuilder>().setComponents(this.buttons.map(b => resolveButtonBuilder(b.button))) : null;

        await this._sendInitialPage((await this.currentPage)!, getEnumValue(SendAs, options.sendAs), (options as InteractionPaginationSendOptions).followUp);

        this.emit('ready');
        this._addCollector();

        return this as ButtonPaginationBuilder<true>;
    }

    public isSent(): this is ButtonPaginationBuilder<true> {
        return super.isSent();
    }

    public toJSON(): ButtonPaginationOptions {
        return {
            ...super.toJSON(),
            buttons: this.buttons,
            onEnd: this.onEnd,
            ephemeral: this.ephemeral,
            collectorOptions: this.collectorOptions,
            deferUpdateControllerInteraction: this.deferUpdateControllerInteraction
        };
    }

    protected _addCollector(): void {
        if (!this.isSent()) throw new Error(`Pagination is not ready`);

        this._collector = this.pagination.createMessageComponentCollector({
            ...this.collectorOptions,
            time: this.endTimer || undefined
        });

        this.collector.on('collect', async component => {
            this.emit('collect', component);

            if (!component.isButton()) return;
            if (this.authorDependent && this.authorId && this.authorId !== component.user.id) return;

            const button = this.buttons.find(b => (b.button.data as APIButtonComponentWithCustomId).custom_id === component.customId);
            if (!button) return;

            switch (button.type) {
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

            this.emit('controllerInteractionCreate', component, button);
            this.collector?.resetTimer();

            if (!component.deferred && this.deferUpdateControllerInteraction) await component.deferUpdate().catch(err => this.emit('error', err));
        });

        this.collector.on('end', async (collected, reason) => {
            this.emit('end', reason);

            switch (this.onEnd) {
                case ButtonPaginationOnEnd.RemoveComponents:
                    this._componentsVisibility = 'RemoveAll';

                    await this.setCurrentPageIndex(undefined, true).catch(err => this.emit('error', err));
                    break;
                case ButtonPaginationOnEnd.DisableComponents:
                    this._componentsVisibility = 'DisableAll';

                    await this.setCurrentPageIndex(undefined, true).catch(err => this.emit('error', err));
                    break;
                case ButtonPaginationOnEnd.DeletePagination:
                    await this.pagination?.delete().catch(err => this.emit('error', err));
                    break;
                case ButtonPaginationOnEnd.Ignore: break;
            }
        });
    }
}