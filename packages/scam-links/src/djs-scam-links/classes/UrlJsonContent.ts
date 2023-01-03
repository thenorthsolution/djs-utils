import axios from 'axios';
import { randomUUID } from 'crypto';
import { Awaitable, If } from 'fallout-utility';

export interface UrlJsonContentOptions<ResponseData = string[]> {
    /**
     * Axios fetch options
     */
    fetchOptions?: Omit<axios.AxiosRequestConfig<string[]>, 'url'|'responseType'>;
    dataParser?: (data: ResponseData) => Awaitable<string[]>;
}

export class UrlJsonContent<ResponseData = string[], Fetched extends boolean = boolean> {
    private _content: null|string[] = null;
    private _lastFetch: null|Date = null;

    readonly id: string = randomUUID();
    readonly url: string;
    readonly fetchOptions?: Omit<axios.AxiosRequestConfig<string[]>, 'url'|'responseType'>;
    readonly dataParser?: (data: ResponseData) => Awaitable<string[]>;

    get content() { return this._content as If<Fetched, string[]> }
    get lastFetch() { return this._lastFetch as If<Fetched, Date>; }

    constructor(url: string, options?: UrlJsonContentOptions<ResponseData>) {
        this.url = url;
        this.fetchOptions = options?.fetchOptions;
        this.dataParser = options?.dataParser;
    }

    /**
     * Fetch domains from url
     */
    public async fetch(): Promise<string[]> {
        const data = await axios<ResponseData>({ ...this.fetchOptions, url: this.url, responseType: 'json' })
            .then(async res => typeof this.dataParser === 'function' ? await this.dataParser(res.data) : res.data);

        this._content = data && Array.isArray(data) ? data : null;

        if (this.isFetched()) {
            this._lastFetch = new Date();
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