import { ActionRow, ActionRowBuilder, ActionRowData, Awaitable, Embed, EmbedBuilder, MessageActionRowComponent, MessageActionRowComponentBuilder, MessageActionRowComponentData, MessageCreateOptions } from 'discord.js';

export interface PageData extends Pick<MessageCreateOptions, 'allowedMentions' | 'content' | 'embeds' | 'files' | 'nonce' | 'stickers'> {
    components?: (ActionRowBuilder<MessageActionRowComponentBuilder>|ActionRow<MessageActionRowComponent>|ActionRowData<MessageActionRowComponent|MessageActionRowComponentData>)[];
    /**
     * Usable for interaction based paginations to send page privately
     */
    ephemeral?: boolean;
}

export type PageResolvable = StaticPageResolvable|DynamicPageFunction;
export type StaticPageResolvable = string|PageData|EmbedBuilder|Embed;
export type DynamicPageFunction = () => PageResolvable|Promise<PageResolvable>;

export function resolvePage(page: StaticPageResolvable): PageData;
export function resolvePage(page: DynamicPageFunction): Promise<PageData>;
export function resolvePage(page: PageResolvable): Promise<PageData>|PageData;
export function resolvePage(page: PageResolvable): Promise<PageData>|PageData {
    if (page instanceof Embed || page instanceof EmbedBuilder) {
        return { content: '', embeds: [page], components: [] };
    } else if (typeof page === 'string') {
        return { content: page, embeds: [], components: [] };
    } else if (typeof page === 'object' && !Array.isArray(page)){
        return page;
    } else if (typeof page === 'function') {
        return (async () => resolvePage(await page()))();
    }

    throw new Error('Unresolvable pagination page');
}