import { BaseGiveawayDatabaseAdapter, GiveawayDatabaseAdapterDataFilterOptions } from '../BaseGiveawayDatabaseAdapter';
import { RawGiveaway, RawGiveawayEntry } from '../../types/structures';
import { mkdir, readFile, writeFile } from 'fs/promises';
import { filter as lodashFilter } from 'lodash';
import { existsSync } from 'fs';
import path from 'path';

export interface JSONDatabaseAdapterSchema {
    giveaways: RawJSONGiveaway[];
    entries: RawJSONGiveawayEntry[];
}

export interface RawJSONGiveaway extends Omit<RawGiveaway, 'createdAt'|'dueDate'> {
    createdAt: string;
    dueDate: string;
}

export interface RawJSONGiveawayEntry extends Omit<RawGiveawayEntry, 'createdAt'> {
    createdAt: string;
}

export interface JSONDatabaseAdapterOptions {
    file?: string;
    parser?: {
        parse(data: string): JSONDatabaseAdapterSchema;
        stringify(data: JSONDatabaseAdapterSchema): string;
    };
}

export class JSONDatabaseAdapter extends BaseGiveawayDatabaseAdapter {
    private _raw: JSONDatabaseAdapterSchema = { giveaways: [], entries: [] };

    readonly file: string = path.join(process.cwd(), 'giveaways.json');
    readonly parser: Exclude<JSONDatabaseAdapterOptions['parser'], undefined> = JSON;

    get data() {
        return { giveaways: this.giveaways, entries: this.entries };
    };

    get giveaways() { return this._raw.giveaways.map(g => JSONDatabaseAdapter.parseGiveaway(g)); }
    get entries() { return this._raw.entries.map(e => JSONDatabaseAdapter.parseGiveawayEntry(e)); }

    constructor(options?: JSONDatabaseAdapterOptions) {
        super();

        this.file = options?.file ? path.resolve(options.file) : this.file;
        this.parser = options?.parser ? options.parser : this.parser;
    }

    public async fetchJson(): Promise<JSONDatabaseAdapterSchema> {
        if (!existsSync(this.file)) return this.saveJson();

        const data = this.parser.parse(await readFile(this.file, 'utf-8'));
        this._raw = data;
        return data;
    }

    public async saveJson(): Promise<JSONDatabaseAdapterSchema> {
        await mkdir(path.dirname(this.file), { recursive: true });
        await writeFile(this.file, this.parser.stringify(this._raw));
        return this._raw;
    }

    public async fetchGiveaways(filter: GiveawayDatabaseAdapterDataFilterOptions<RawGiveaway>): Promise<RawGiveaway[]> {
        await this.fetchJson();
        return (filter?.filter ? lodashFilter(this.giveaways, filter.filter) : this.giveaways).splice(0, filter?.count ?? Infinity);
    }

    public async updateGiveaways(filter: GiveawayDatabaseAdapterDataFilterOptions<RawGiveaway>, data: Partial<RawGiveaway>): Promise<RawGiveaway[]> {
        const giveaways = await this.fetchGiveaways(filter);
        const newGiveaways = giveaways.map(giveaway => ({ ...giveaway, ...data }));

        for (const index in newGiveaways) {
            const newGiveaway = newGiveaways.at(Number(index));
            const oldGiveaway = giveaways.at(Number(index));
            if (!newGiveaway || !oldGiveaway) continue;

            const databaseIndex = this._raw.giveaways.findIndex(g => g.id === oldGiveaway.id);
            this._raw.giveaways[databaseIndex] = JSONDatabaseAdapter.parseGiveaway(newGiveaway);

            this.emit('giveawayUpdate', oldGiveaway, newGiveaway);
        }

        await this.saveJson();

        return newGiveaways;
    }

    public async deleteGiveaways(filter: GiveawayDatabaseAdapterDataFilterOptions<RawGiveaway>): Promise<RawGiveaway[]> {
        const giveaways = await this.fetchGiveaways(filter);
        const entries =  this._raw.entries.filter(e => giveaways.some(d => d.id === e.giveawayId));

        this._raw.giveaways = this._raw.giveaways.filter(g => !giveaways.some(d => d.id === g.id));
        this._raw.entries = this._raw.entries.filter(e => !entries.some(d => d.id === e.id));

        for (const giveaway of giveaways) {
            for (const entry of entries.filter(e => e.giveawayId === giveaway.id)) {
                this.emit('giveawayEntryDelete', entry);
            }

            this.emit('giveawayDelete', giveaway);
        }

        await this.saveJson();

        return giveaways;
    }

    public async createGiveaway(data: Omit<RawGiveaway, 'id'>): Promise<RawGiveaway> {
        await this.fetchJson();

        const id = data.messageId;
        const giveaway: RawGiveaway = { id, ...data };

        this._raw.giveaways.push(JSONDatabaseAdapter.parseGiveaway(giveaway));
        this.emit('giveawayCreate', giveaway);

        await this.saveJson();

        return giveaway;
    }

    public async fetchGiveawayEntries(filter: GiveawayDatabaseAdapterDataFilterOptions<RawGiveawayEntry>): Promise<RawGiveawayEntry[]> {
        await this.fetchJson();
        return (filter?.filter ? lodashFilter(this.entries, filter.filter) : this.entries).splice(0, filter?.count ?? Infinity);
    }

    public async updateGiveawayEntries(filter: GiveawayDatabaseAdapterDataFilterOptions<RawGiveawayEntry>, data: Partial<RawGiveawayEntry>): Promise<RawGiveawayEntry[]> {
        const entries = await this.fetchGiveawayEntries(filter);
        const newEntries = entries.map(giveaway => ({ ...giveaway, ...data }));

        for (const index in newEntries) {
            const newEntry = newEntries.at(Number(index));
            const oldEntry = entries.at(Number(index));
            if (!newEntry || !oldEntry) continue;

            const databaseIndex = this._raw.giveaways.findIndex(g => g.id === oldEntry.id);
            this._raw.entries[databaseIndex] = JSONDatabaseAdapter.parseGiveawayEntry(newEntry);

            this.emit('giveawayEntryUpdate', oldEntry, newEntry);
        }

        await this.saveJson();

        return newEntries;
    }

    public async deleteGiveawayEntries(filter: GiveawayDatabaseAdapterDataFilterOptions<RawGiveawayEntry>): Promise<RawGiveawayEntry[]> {
        const entries = await this.fetchGiveawayEntries(filter);

        for (const entry of entries) {
            this.emit('giveawayEntryDelete', entry);
        }

        this._raw.entries = this._raw.entries.filter(e => !entries.some(d => d.id === e.id));
        await this.saveJson();

        return entries;
    }

    public async createGiveawayEntry(data: Omit<RawGiveawayEntry, 'id'>): Promise<RawGiveawayEntry> {
        await this.fetchJson();

        const id = Number(BigInt(Date.now()) << 22n).toString();
        const entry: RawGiveawayEntry = { id, ...data };

        this._raw.entries.push(JSONDatabaseAdapter.parseGiveawayEntry(entry));
        this.emit('giveawayEntryCreate', entry);

        await this.saveJson();

        return entry;
    }

    public static parseGiveaway(giveaway: RawGiveaway): RawJSONGiveaway;
    public static parseGiveaway(giveaway: RawJSONGiveaway): RawGiveaway;
    public static parseGiveaway(giveaway: RawGiveaway|RawJSONGiveaway): RawGiveaway|RawJSONGiveaway {
        return {
            ...giveaway,
            createdAt: this.parseDate(giveaway.createdAt) as any,
            dueDate: giveaway.dueDate && this.parseDate(giveaway.dueDate) as any
        };
    }

    public static parseGiveawayEntry(entry: RawGiveawayEntry): RawJSONGiveawayEntry;
    public static parseGiveawayEntry(entry: RawJSONGiveawayEntry): RawGiveawayEntry;
    public static parseGiveawayEntry(entry: RawGiveawayEntry|RawJSONGiveawayEntry): RawGiveawayEntry|RawJSONGiveawayEntry {
        return {
            ...entry,
            createdAt: this.parseDate(entry.createdAt) as any,
        };
    }

    public static parseDate(date: Date): string;
    public static parseDate(date: string): Date;
    public static parseDate(date: string|Date): string|Date;
    public static parseDate(date: string|Date): string|Date {
        return typeof date === 'string' ? new Date(date) : date.toISOString();
    }
}