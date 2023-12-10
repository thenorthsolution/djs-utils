import { IGiveaway, IGiveawayEntry } from '../../types/giveaway';
import { BaseDatabaseAdapter } from '../BaseDatabaseAdapter';
import { GiveawayManager } from '../GiveawayManager';
import type Sqlite3 from 'better-sqlite3';
import path from 'path';
import { mkdir } from 'fs/promises';

export interface Sqlite3DatabaseAdapterOptions {
    file?: string;
    databaseOptions?: Sqlite3.Options;
}

export interface RawSqlite3Giveaway extends Omit<IGiveaway, 'endsAt'|'createdAt'|'endedAt'|'winnersEntryId'|'ended'> {
    endsAt: string;
    createdAt: string;
    ended: 'true'|'false';
    endedAt: string|null;
    winnersEntryId: string;
}

export interface RawSqlite3GiveawayEntry extends Omit<IGiveawayEntry, 'createdAt'> {
    createdAt: string;
}

export class Sqlite3DatabaseAdapter extends BaseDatabaseAdapter {
    readonly file: string = path.join(process.cwd(), 'giveaways.db');

    public database!: Sqlite3.Database;

    constructor(private _options?: Sqlite3DatabaseAdapterOptions) {
        super();

        try {
            require.resolve('better-sqlite3');
        } catch(err) {
            throw new Error('Unable to find required dependency: better-sqlite3');
        }

        this.file = _options?.file ?? this.file;
    }

    public async start(manager: GiveawayManager<this>): Promise<void> {
        await mkdir(path.dirname(this.file), { recursive: true });

        this.database = require('better-sqlite3')(this.file, this._options?.databaseOptions);

        this.database.exec(`
            CREATE TABLE IF NOT EXISTS "Giveaways" (
                "id" TEXT NOT NULL PRIMARY KEY,
                "guildId" TEXT NOT NULL,
                "channelId" TEXT NOT NULL,
                "messageId" TEXT NOT NULL,
                "authorId" TEXT,
                "name" TEXT NOT NULL,
                "winnerCount" INTEGER NOT NULL DEFAULT 1,
                "endsAt" DATETIME NOT NULL,
                "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                "ended" BOOLEAN NOT NULL DEFAULT false,
                "endedAt" DATETIME,
                "winnersEntryId" TEXT NOT NULL DEFAULT "[]"
            );

            CREATE TABLE IF NOT EXISTS "GiveawayEntries" (
                "id" TEXT NOT NULL PRIMARY KEY,
                "giveawayId" TEXT NOT NULL,
                "userId" TEXT NOT NULL,
                "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                CONSTRAINT "GiveawayEtries_giveawayId_fkey" FOREIGN KEY ("giveawayId") REFERENCES "Giveaways" ("id") ON DELETE CASCADE ON UPDATE CASCADE
            );

            CREATE UNIQUE INDEX IF NOT EXISTS "Giveaways_id_key" ON "Giveaways"("id");
            CREATE UNIQUE INDEX IF NOT EXISTS "Giveaways_messageId_key" ON "Giveaways"("messageId");
            CREATE UNIQUE INDEX IF NOT EXISTS "GiveawayEtries_id_key" ON "GiveawayEntries"("id");
        `);

        await super.start(manager);
    }

    public async fetchGiveaways(options?: { filter?: Partial<IGiveaway>|undefined; count?: number | undefined; } | undefined): Promise<IGiveaway[]> {
        let query = `SELECT * FROM 'Giveaways'`;
        let values: string[] = [];

        if (options?.filter) {
            query += ` WHERE`;

            Object.keys(options.filter).forEach((key, index) => {
                let value: any = (options.filter ?? {})[key as keyof IGiveaway];
                if (value === undefined) return;

                value = Sqlite3DatabaseAdapter.parseValue(value);

                query += ` ${index ? 'AND ' : ''}${key} = ?`;
                values.push(value);
            });
        }

        if (typeof options?.count === 'number') {
            query += `LIMIT ${options.count}`;
        }

        return this.database.prepare(query).all(...values).map(g => Sqlite3DatabaseAdapter.parseGiveaway(g as RawSqlite3Giveaway));
    }

    public async fetchGiveaway(giveawayId: string): Promise<IGiveaway|undefined> {
        const data = this.database.prepare(`SELECT * FROM 'Giveaways' WHERE id = ?`).get(giveawayId) as RawSqlite3Giveaway|undefined;
        return data ? Sqlite3DatabaseAdapter.parseGiveaway(data) : undefined;
    }

    public async createGiveaway(data: IGiveaway): Promise<IGiveaway> {
        this.database.prepare(`INSERT INTO 'Giveaways' VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
            data.id,
            data.guildId,
            data.channelId,
            data.messageId,
            data.authorId,
            data.name,
            data.winnerCount,
            data.endsAt.toISOString(),
            data.createdAt.toISOString(),
            String(data.ended),
            data.endedAt?.toISOString() ?? null,
            JSON.stringify(data.winnersEntryId)
        );

        this.emit('giveawayCreate', data);

        return data;
    }

    public async updateGiveaway(giveawayId: string, data: Partial<IGiveaway>): Promise<IGiveaway> {
        const giveaway = await this.fetchGiveaway(giveawayId);
        if (!giveaway) throw new Error(`Unable to update giveaway! Giveaway id not found: ${giveawayId}`);

        const newGiveaway = {
            ...giveaway,
            ...data
        };

        let query = `UPDATE 'Giveaways'`;
        let values: string[] = [];
        let keys = Object.keys(data);

        if (keys.length) {
            query += ` SET`;

            keys.forEach((key, index) => {
                let value: any = (data ?? {})[key as keyof IGiveaway];
                if (value === undefined) return;

                value = Sqlite3DatabaseAdapter.parseValue(value)

                query += ` ${key} = ?${key !== (keys[keys.length - 1]) ? ',' : ''}`;
                values.push(value);
            });
        }

        query += ` WHERE id = ?`;
        values.push(giveawayId);

        const updated = this.database.prepare(query).run(...values).changes;
        if (!updated) throw new Error('Unable to update giveaway! No changes found');

        this.emit('giveawayUpdate', giveaway, newGiveaway);

        return newGiveaway;
    }

    public async deleteGiveaway(giveawayId: string): Promise<IGiveaway|undefined>;
    public async deleteGiveaway(filter: Partial<IGiveaway>, count?: number): Promise<IGiveaway[]>;
    public async deleteGiveaway(filter: string|Partial<IGiveaway>, count?: number): Promise<IGiveaway|IGiveaway[]|undefined> {
        const findFirst = typeof filter === 'string';

        filter = typeof filter === 'string' ? { id: filter } : filter;

        const giveaways = await this.fetchGiveaways({ filter, count: findFirst ? 1 : count });
        if (!giveaways.length) return findFirst ? giveaways[0] : giveaways;

        let query = `DELETE FROM 'Giveaways'`;
        let values: string[] = [];

        if (giveaways.length) {
            query += ' WHERE';
            giveaways.forEach((giveaway, index) => {
                query += ` id = ?${index !== (giveaways.length - 1) ? ' OR' : ''}`;
                values.push(giveaway.id);
            })
        }

        this.database.prepare(query).run(...values);
        giveaways.forEach(g => this.emit('giveawayDelete', g));

        return findFirst ? giveaways[0] : giveaways;
    }

    public async fetchGiveawayEntries(options?: { filter?: Partial<IGiveawayEntry>|undefined; count?: number | undefined; } | undefined): Promise<IGiveawayEntry[]> {
        let query = `SELECT * FROM 'GiveawayEntries'`;
        let values: string[] = [];

        if (options?.filter) {
            query += ` WHERE`;

            Object.keys(options.filter).forEach((key, index) => {
                let value: any = (options.filter ?? {})[key as keyof IGiveawayEntry];
                if (value === undefined) return;

                value = Sqlite3DatabaseAdapter.parseValue(value);

                query += ` ${index ? 'AND ' : ''}${key} = ?`;
                values.push(value);
            });
        }

        if (typeof options?.count === 'number') {
            query += `LIMIT ${options.count}`;
        }

        return this.database.prepare(query).all(...values).map(g => Sqlite3DatabaseAdapter.parseGiveawayEntry(g as RawSqlite3GiveawayEntry));
    }

    public async fetchGiveawayEntry(entryId: string): Promise<IGiveawayEntry|undefined> {
        const data = this.database.prepare(`SELECT * FROM 'GiveawayEntries' WHERE id = ?`).get(entryId) as RawSqlite3GiveawayEntry|undefined;
        return data ? Sqlite3DatabaseAdapter.parseGiveawayEntry(data) : undefined;
    }

    public async createGiveawayEntry(giveawayId: string, data: IGiveawayEntry): Promise<IGiveawayEntry> {
        const giveaway = await this.fetchGiveaway(giveawayId);
        if (!giveaway) throw new Error(`Unable to create new giveaway`);

        this.database.prepare(`INSERT INTO 'GiveawayEntries' VALUES (?, ?, ?, ?)`).run(
            data.id,
            data.giveawayId,
            data.userId,
            data.createdAt.toISOString()
        );

        this.emit('giveawayEntryCreate', data);

        return data;
    }

    public async updateGiveawayEntry(entryId: string, data: Partial<IGiveawayEntry>): Promise<IGiveawayEntry> {
        const entry = await this.fetchGiveawayEntry(entryId);
        if (!entry) throw new Error(`Unable to update entry! Entry id not found: ${entryId}`);

        const newEntry = {
            ...entry,
            ...data
        };

        let query = `UPDATE 'GiveawayEntries'`;
        let values: string[] = [];
        let keys = Object.keys(data);

        if (keys.length) {
            query += ` SET`;

            keys.forEach((key, index) => {
                let value: any = (data ?? {})[key as keyof IGiveawayEntry];
                if (value === undefined) return;

                    value = Sqlite3DatabaseAdapter.parseValue(value);

                query += ` ${key} = ?${key !== (keys[keys.length - 1]) ? ',' : ''}`;
                values.push(value);
            });
        }

        query += ` WHERE id = ?`;
        values.push(entryId);

        const updated = this.database.prepare(query).run(...values).changes;
        if (!updated) throw new Error('Unable to update entry! No changes found');

        this.emit('giveawayEntryUpdate', entry, newEntry);

        return newEntry;
    }

    public async deleteGiveawayEntry(giveawayId: string): Promise<IGiveawayEntry|undefined>;
    public async deleteGiveawayEntry(filter: Partial<IGiveawayEntry>, count?: number): Promise<IGiveawayEntry[]>;
    public async deleteGiveawayEntry(filter: string|Partial<IGiveawayEntry>, count?: number): Promise<IGiveawayEntry|IGiveawayEntry[]|undefined> {
        const findFirst = typeof filter === 'string';

        filter = typeof filter === 'string' ? { id: filter } : filter;

        const entries = await this.fetchGiveawayEntries({ filter, count: findFirst ? 1 : count });
        if (!entries.length) return findFirst ? entries[0] : entries;

        let query = `DELETE FROM 'GiveawayEntries'`;
        let values: string[] = [];

        if (entries.length) {
            query += ' WHERE';
            entries.forEach((entry, index) => {
                query += ` id = ?${index !== (entries.length - 1) ? ' OR' : ''}`;
                values.push(entry.id);
            })
        }

        this.database.prepare(query).run(...values);
        entries.forEach(e => this.emit('giveawayEntryDelete', e));

        return findFirst ? entries[0] : entries;
    }

    // Static Methods

    public static parseGiveaway(giveaway: IGiveaway): RawSqlite3Giveaway;
    public static parseGiveaway(giveaway: RawSqlite3Giveaway): IGiveaway;
    public static parseGiveaway(giveaway: IGiveaway|RawSqlite3Giveaway): IGiveaway|RawSqlite3Giveaway {
        return {
            ...giveaway,
            createdAt: this.parseDate(giveaway.createdAt) as any,
            endedAt: (giveaway.endedAt ? this.parseDate(giveaway.endedAt) : null) as any,
            ended: typeof giveaway.ended === 'string' ? (giveaway.ended === 'true') : giveaway.ended, 
            endsAt: this.parseDate(giveaway.endsAt) as any,
            winnersEntryId: typeof giveaway.winnersEntryId === 'string'
                ? JSON.parse(giveaway.winnersEntryId)
                : JSON.stringify(giveaway.winnersEntryId)
        };
    }

    public static parseGiveawayEntry(entry: IGiveawayEntry): RawSqlite3GiveawayEntry;
    public static parseGiveawayEntry(entry: RawSqlite3GiveawayEntry): IGiveawayEntry;
    public static parseGiveawayEntry(entry: IGiveawayEntry|RawSqlite3GiveawayEntry): IGiveawayEntry|RawSqlite3GiveawayEntry {
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

    public static parseValue(value: string|string[]|number|boolean|Date|null): string|number|null {
        if (value instanceof Date) return this.parseDate(value);
        if (Array.isArray(value)) return JSON.stringify(value);
        if (value === null) return null;
        if (value === undefined) return '';
        if (typeof value === 'number') return value;
        if (typeof value === 'boolean') return value === true ? 'true' : 'false';

        return String(value);
    }
}