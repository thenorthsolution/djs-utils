import path from 'path';
import { IGiveaway, IGiveawayEntry } from '../../types/giveaway';
import { BaseDatabaseAdapter } from '../BaseDatabaseAdapter';
import { mkdir, readFile, writeFile } from 'fs/promises';
import { filter as lodashFilter } from 'lodash';
import { existsSync } from 'fs';

export interface JsonDatabaseSchema {
    giveaways: RawJsonGiveaway[];
    entries: RawJsonGiveawayEntry[];
};

export interface RawJsonGiveaway extends Omit<IGiveaway, 'endsAt'|'createdAt'|'endedAt'> {
    endsAt: string;
    createdAt: string;
    endedAt: string|null;
}

export interface RawJsonGiveawayEntry extends Omit<IGiveawayEntry, 'createdAt'> {
    createdAt: string;
}

export interface JsonDatabaseAdapterOptions {
    file?: string;
    parser?: {
        parse(data: string): JsonDatabaseSchema;
        stringify(data: JsonDatabaseSchema): string;
    };
}

export class JsonDatabaseAdapter extends BaseDatabaseAdapter {
    private _raw: JsonDatabaseSchema = { giveaways: [], entries: [] };

    readonly file: string = path.join(process.cwd(), 'giveaways.json');
    readonly parser: Exclude<JsonDatabaseAdapterOptions['parser'], undefined> = JSON;

    get data() {
        return {
            giveaways: this._raw.giveaways.map(g => JsonDatabaseAdapter.parseGiveaway(g)),
            entries: this._raw.entries.map(e => JsonDatabaseAdapter.parseGiveawayEntry(e))
        };
    };

    get giveaways() { return this.data.giveaways; }
    get entries() { return this.data.entries; }

    constructor(options?: JsonDatabaseAdapterOptions) {
        super();

        this.file = options?.file ? path.resolve(options.file) : this.file;
        this.parser = options?.parser ? options.parser : this.parser;
    }

    public async fetchJson(): Promise<JsonDatabaseSchema> {
        if (!existsSync(this.file)) return this.saveJson();

        const data = this.parser.parse(await readFile(this.file, 'utf-8'));
        this._raw = data;
        return data;
    }

    public async saveJson(data?: JsonDatabaseSchema): Promise<JsonDatabaseSchema> {
        data ??= this._raw;

        await mkdir(path.dirname(this.file), { recursive: true });
        await writeFile(this.file, this.parser.stringify(data));

        return data;
    }

    public async fetchGiveaways(options?: { filter?: Partial<IGiveaway>, count?: number }): Promise<IGiveaway[]> {
        await this.fetchJson();
        return (options?.filter ? lodashFilter(this.giveaways, options.filter) : this.giveaways).splice(0, options?.count ?? Infinity);
    }

    public async fetchGiveaway(giveawayId: string): Promise<IGiveaway|undefined> {
        await this.fetchJson();
        return this.giveaways.find(g => g.id === giveawayId);
    }

    public async createGiveaway(data: IGiveaway): Promise<IGiveaway> {
        await this.fetchJson();

        const isExists = this.giveaways.some(g => g.id === data.id || g.messageId === data.messageId);
        if (isExists) throw new Error('Unable to create new giveaway! given id or messageId is already used');

        this._raw.giveaways.push(JsonDatabaseAdapter.parseGiveaway(data));
        await this.saveJson();

        const giveaway = this.giveaways.find(g => g.id === data.id);
        if (!giveaway) throw new Error('Unable to create new giveaway! Json file did not save');

        return giveaway;
    }

    public async updateGiveaway(giveawayId: string, data: Partial<IGiveaway>): Promise<IGiveaway> {
        const giveaway = await this.fetchGiveaway(giveawayId);
        if (!giveaway) throw new Error(`Unable to update giveaway! Giveaway id not found: ${giveawayId}`);

        const giveawayIndex = this.giveaways.findIndex(g => g.id === giveawayId);
        const newGiveaway: RawJsonGiveaway = JsonDatabaseAdapter.parseGiveaway({
            ...giveaway,
            ...data
        });

        this._raw.giveaways[giveawayIndex] = newGiveaway;
        await this.saveJson();

        return JsonDatabaseAdapter.parseGiveaway(newGiveaway);
    }

    public async deleteGiveaway(giveawayId: string): Promise<IGiveaway|undefined>;
    public async deleteGiveaway(filter: Partial<IGiveaway>, count?: number): Promise<IGiveaway[]>;
    public async deleteGiveaway(filter: string|Partial<IGiveaway>, count?: number): Promise<IGiveaway|IGiveaway[]|undefined> {
        const findFirst = typeof filter === 'string';

        filter = typeof filter === 'string' ? { id: filter } : filter;

        await this.fetchJson();
        const giveaways = lodashFilter(this.giveaways, filter).splice(0, count ?? Infinity);

        this._raw.giveaways = this._raw.giveaways.filter(g => !giveaways.some(d => d.id === g.id));
        this._raw.entries = this._raw.entries.filter(e => !giveaways.some(d => d.id === e.giveawayId));

        await this.saveJson();

        return findFirst ? giveaways[0] : giveaways;
    }

    public async fetchGiveawayEntries(options: { filter?: Partial<IGiveawayEntry>; count?: number; }): Promise<IGiveawayEntry[]> {
        await this.fetchJson();
        return (options?.filter ? lodashFilter(this.entries, options.filter) : this.entries).splice(0, options?.count ?? Infinity);
    }

    public async fetchGiveawayEntry(entryId: string): Promise<IGiveawayEntry|undefined> {
        await this.fetchJson();
        return this.entries.find(e => e.id === entryId);
    }

    public async createGiveawayEntry(giveawayId: string, data: IGiveawayEntry): Promise<IGiveawayEntry> {
        const giveaway = await this.fetchGiveaway(giveawayId);
        if (!giveaway) throw new Error(`Unable to create giveaway entry! Giveaway id not found: ${giveawayId}`);

        const isExists = this.entries.find(e => e.id === data.id || (e.giveawayId === data.giveawayId && e.userId === data.userId));
        if (isExists) throw new Error('Unable to create giveaway entry! Entry id already exists');

        this._raw.entries.push(JsonDatabaseAdapter.parseGiveawayEntry(data));
        await this.saveJson();

        const entry = this.entries.find(e => e.id === data.id);
        if (!entry) throw new Error('Unable to create new entry! Json file did not save');

        return entry;
    }

    public async updateGiveawayEntry(entryId: string, data: Partial<IGiveawayEntry>): Promise<IGiveawayEntry> {
        const entry = await this.fetchGiveawayEntry(entryId);
        if (!entry) throw new Error(`Unable to entry! Entry id not found: ${entryId}`);

        const entryIndex = this._raw.entries.findIndex(e => e.id === entryId);
        const newEntry: RawJsonGiveawayEntry = JsonDatabaseAdapter.parseGiveawayEntry({
            ...entry,
            ...data
        });

        this._raw.entries[entryIndex] = newEntry;
        await this.saveJson();

        return JsonDatabaseAdapter.parseGiveawayEntry(newEntry);
    }

    public async deleteGiveawayEntry(entryId: string): Promise<IGiveawayEntry|undefined>;
    public async deleteGiveawayEntry(filter: Partial<IGiveawayEntry>, count?: number): Promise<IGiveawayEntry[]>;
    public async deleteGiveawayEntry(filter: string|Partial<IGiveawayEntry>, count?: number): Promise<IGiveawayEntry|IGiveawayEntry[]|undefined> {
        const findFirst = typeof filter === 'string';

        filter = typeof filter === 'string' ? { id: filter } : filter;

        await this.fetchJson();
        const entries = lodashFilter(this.entries, filter).splice(0, count ?? Infinity);

        this._raw.entries = this._raw.entries.filter(e => !entries.some(d => d.id === e.id));
        await this.saveJson();
        return findFirst ? entries[0] : entries;
    }

    // Static Methods

    public static parseGiveaway(giveaway: IGiveaway): RawJsonGiveaway;
    public static parseGiveaway(giveaway: RawJsonGiveaway): IGiveaway;
    public static parseGiveaway(giveaway: IGiveaway|RawJsonGiveaway): IGiveaway|RawJsonGiveaway {
        return {
            ...giveaway,
            createdAt: this.parseDate(giveaway.createdAt) as any,
            endedAt: (giveaway.endedAt ? this.parseDate(giveaway.endedAt) : null) as any,
            endsAt: this.parseDate(giveaway.endsAt) as any
        };
    }

    public static parseGiveawayEntry(entry: IGiveawayEntry): RawJsonGiveawayEntry;
    public static parseGiveawayEntry(entry: RawJsonGiveawayEntry): IGiveawayEntry;
    public static parseGiveawayEntry(entry: IGiveawayEntry|RawJsonGiveawayEntry): IGiveawayEntry|RawJsonGiveawayEntry {
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