import { Awaitable, If, RestOrArray, TypedEmitter, normalizeArray, replaceAll } from 'fallout-utility';
import { UrlJsonContent, UrlJsonContentOptions } from './UrlJsonContent';
import { Collection } from '@discordjs/collection';

export interface DiscordScamLinksOptions {
    /**
     * Fetch domain arrays from url
     */
    fetchJsonFromUrl: string|(string|{ url: string; dataParser: (data: Response) => Awaitable<string[]>; })[];
    /**
     * Max cached domains age
     */
    maxCacheAgeMs: number;
    /**
     * Refresh cache interval
     */
    refreshCacheEveryMs: number|null;
}

export interface DiscordScamLinksEvents {
    error: [error: Error];
    cacheRefresh: [];
    cacheFetch: [cached: UrlJsonContent<any, true>];
    cacheAdd: [cached: UrlJsonContent<any>];
}

export class DiscordScamLinks<Ready extends boolean = boolean> extends TypedEmitter<DiscordScamLinksEvents> {
    private _options?: Partial<DiscordScamLinksOptions>;
    private _ready: boolean = false;

    protected _cache: Collection<string, UrlJsonContent> = new Collection();
    protected _refreshCacheInterval?: NodeJS.Timer;
    protected _maxCacheAge: number = 60000 * 20;

    readonly addedDomains: string[] = [];

    get cache() { return this._cache as Collection<string, If<Ready, UrlJsonContent<any, true>, UrlJsonContent>>; }
    get maxCacheAge() { return this._options?.maxCacheAgeMs ?? this._maxCacheAge; }
    get allDomains() {
        const cachedDomains = this.cache.filter(cached => cached.isFetched()).map(cached => cached.content!);

        return [...this.addedDomains, ...(cachedDomains.length ? cachedDomains.reduce((prev, current) => [...prev, ...current]) : [])];
    }

    constructor(options: Partial<DiscordScamLinksOptions> = {
        fetchJsonFromUrl: [
            {
                url: 'https://raw.githubusercontent.com/Discord-AntiScam/scam-links/main/list.json',
                dataParser: data => data.json()
            }
        ],
    }) {
        super();
        this._options = options;

        (typeof options?.fetchJsonFromUrl === 'string' ? [options.fetchJsonFromUrl] : options?.fetchJsonFromUrl)?.forEach(url => typeof url === 'string'
            ? this.fetchDomainsFromUrl(url)
            : this.fetchDomainsFromUrl(url.url, { dataParser: url.dataParser })
        ); 
    }

    /**
     * Refresh cached domains
     * @param checkCacheAge Only refresh cached domains older than max cache age
     */
    public async refreshDomains(checkCacheAge: boolean = true): Promise<void> {
        if (!this._ready) this._ready = true;

        await Promise.all(this.cache.map(async cached => {
            if (!cached.isFetched() || (!checkCacheAge || !cached.lastFetch || (Date.now() - cached.lastFetch.getTime()) >= this.maxCacheAge)) {
                await cached.fetch().catch(err => this.emit('error', err));
            }

            return cached;
        }));

        if (!this._refreshCacheInterval && this._options?.refreshCacheEveryMs !== null) {
            this._refreshCacheInterval = setInterval(async () => this.refreshDomains(true), this._options?.refreshCacheEveryMs ?? 60000 * 5);
        }

        this.emit('cacheRefresh');
    }

    /**
     * Fetch domains from url
     * @param url Domains json url
     * @param options Fetch options
     */
    public async fetchDomainsFromUrl<ResponseData = string[]>(url: string, options?: UrlJsonContentOptions<ResponseData> & { dontCache?: boolean; }): Promise<UrlJsonContent<ResponseData, true>> {
        const data = new UrlJsonContent(url, options);

        await data.fetch();
        if (!options?.dontCache) {
            this.cache.set(url, data as any);
            this.emit('cacheAdd', data);
        }

        return data;
    }

    /**
     * Add static domain
     * @param domains Domains to add
     */
    public addDomains(...domains: RestOrArray<string>): this {
        this.addedDomains.push(...normalizeArray(domains));
        return this;
    }

    /**
     * Set cache max age
     * @param maxCacheAgeMs Cache max age
     */
    public setMaxCacheAge(maxCacheAgeMs: number): this {
        this._options = {
            ...(this._options ?? {}),
            maxCacheAgeMs
        };

        return this;
    }

    /**
     * Check if data contains any stored domains
     * @param data String data to check
     * @param refreshCache Refresh cache before checking
     */
    public isMatch(data: string, refreshCache?: false|{ refreshCache?: false; matchNonUrl?: boolean; }): boolean;
    public isMatch(data: string, refreshCache?: true|{ refreshCache?: true; matchNonUrl?: boolean; }): Promise<boolean>;
    public isMatch(data: string, _options: boolean|{ refreshCache?: boolean; matchNonUrl?: boolean; } = false): Awaitable<boolean> {
        data = data.toLowerCase();

        const options = typeof _options === 'boolean' ? { refreshCache: _options } : _options;

        if (options.refreshCache) {
            return (async () => {
                await this.refreshDomains();
                return !!this.getMatch(data);;
            })();
        }

        return !!this.getMatch(data, options.matchNonUrl);
    }

    /**
     * Get the matched domains if anything matches from a string
     * @param data String data
     * @param matchNonUrl Matches domain to non url string
     */
    public getMatch(data: string, matchNonUrl?: boolean): string|null {
        return this.getMatches(data, matchNonUrl)[0] ?? null;
    }

    /**
     * Get the matched domains if anything matches from a string
     * @param data String data
     * @param matchNonUrl Matches domain to non url string
     */
    public getMatches(data: string, matchNonUrl?: boolean): string[] {
        const tokens = data.toLowerCase().split(/\s+/);

        return this.allDomains.filter(domain => tokens.some(t => {
            if (matchNonUrl) return t.includes(domain);

            t = replaceAll(t, ['http://', 'https://'], ['', '']);
            const i = t.split('/');

            return i.some(w => w === domain);
        }));
    }

    /**
     * Check if cache is fetched
     */
    public isReady(): this is DiscordScamLinks<true> {
        return this._ready;
    }
}