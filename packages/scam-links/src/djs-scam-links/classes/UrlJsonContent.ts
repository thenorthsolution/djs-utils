import { DiscordScamLinks } from './DiscordScamLinks';
import { Awaitable, If } from 'fallout-utility';
import { randomUUID } from 'crypto';

export interface UrlJsonContentOptions<ResponseData = string[]> {
    djsScamLinks?: DiscordScamLinks;
    /**
     * Axios fetch options
     */
    fetchOptions?: RequestInit;
    dataParser?: (data: Response) => Awaitable<string[]>;
}

export class UrlJsonContent<ResponseData = string[], Fetched extends boolean = boolean> {
    private _content: null|string[] = null;
    private _lastFetch: null|Date = null;

    readonly djsScamLinks?: DiscordScamLinks;
    readonly id: string = randomUUID();
    readonly url: string;
    readonly fetchOptions?: RequestInit;
    readonly dataParser?: (data: Response) => Awaitable<string[]>;

    get content() { return this._content as If<Fetched, string[]> }
    get lastFetch() { return this._lastFetch as If<Fetched, Date>; }

    constructor(url: string, options?: UrlJsonContentOptions<ResponseData>) {
        this.djsScamLinks = options?.djsScamLinks;
        this.url = url;
        this.fetchOptions = options?.fetchOptions;
        this.dataParser = options?.dataParser;
    }

    /**
     * Fetch domains from url
     */
    public async fetch(): Promise<string[]> {
        const data = await fetch(this.url, this.fetchOptions)
            .then(async res => typeof this.dataParser === 'function' ? await this.dataParser(res) : res.json());

        this._content = data && Array.isArray(data) ? data : null;

        if (this.isFetched()) {
            this._lastFetch = new Date();
            this.djsScamLinks?.emit('cacheFetch', this);

            return this.content;
        }

        throw new Error(`Couldn't fetch content from '${this.url}'`);
    }

    /**
     * Check if url is fetched
     */
    public isFetched(): this is UrlJsonContent<ResponseData, true> {
        return this._content !== null && Array.isArray(this._content);
    }
}