import { Awaitable, BaseMessageOptions, Embed, EmbedBuilder, MessageResolvable, RestOrArray, normalizeArray } from 'discord.js';
import { PaginationActionRows } from './enums';

export interface PageData extends BaseMessageOptions {
    message?: MessageResolvable;
}

export type PageResolvable = StaticPageResolvable|DynamicPageFunction;
export type StaticPageResolvable = string|PageData|EmbedBuilder|Embed;
export type DynamicPageFunction = () => Awaitable<PageResolvable>;

export type PaginationComponentsOrder = ((keyof typeof PaginationActionRows)|PaginationActionRows)[];
export type PaginationComponentsOrderWithoutControllers = ((keyof Omit<typeof PaginationActionRows, 'ControllersActionRow'>)|PaginationActionRows.AdditionalActionRows|PaginationActionRows.PageActionRows)[];

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

export function resolveStaticPages(...pages: RestOrArray<PageResolvable>): (PageData|DynamicPageFunction)[] {
    return normalizeArray(pages).map(p => typeof p === 'function' ? p : resolvePage(p));
}

export async function resolvePages(...pages: RestOrArray<PageResolvable>): Promise<PageData[]> {
    return Promise.all(normalizeArray(pages).map(p => resolvePage(p)));
}