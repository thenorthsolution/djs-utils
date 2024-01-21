import type Sqlite3 from 'better-sqlite3';
import { BaseGiveawayDatabaseAdapter, GiveawayDatabaseAdapterDataFilterOptions } from '../BaseGiveawayDatabaseAdapter';
import { GiveawayManager } from '../GiveawayManager';
import { RawGiveaway, RawGiveawayEntry } from '../../types/structures';
import path from 'path';

export interface Sqlite3DatabaseAdapterOptions {
    database: string|Buffer|Sqlite3.Database|[string|Buffer, Sqlite3.Options];
    tables?: {
        giveaways?: string;
        giveawayEntries?: string;
    }
}

export type Sqlite3Boolean = 'true'|'false';

export interface RawSqlite3Giveaway extends Omit<RawGiveaway, 'createdAt'|'paused'|'ended'|'dueDate'|'riggedUsersId'|'winnersEntryId'> {
    createdAt: string;
    paused: Sqlite3Boolean;
    ended: Sqlite3Boolean;
    dueDate: string;
    riggedUsersId: string|null;
    winnersEntryId: string;
}

export interface RawSqlite3GiveawayEntry extends Omit<RawGiveawayEntry, 'createdAt'> {
    createdAt: string;
}

export class Sqlite3DatabaseAdapter extends BaseGiveawayDatabaseAdapter {
    public static Database?: typeof Sqlite3;
    public database!: Sqlite3.Database;
    public tables: Required<Exclude<Sqlite3DatabaseAdapterOptions['tables'], undefined>> = {
        giveaways: 'Giveaways',
        giveawayEntries: 'GiveawayEntries'
    };

    constructor(readonly options?: Sqlite3DatabaseAdapterOptions) {
        super();
    }

    public async start(manager: GiveawayManager<this>): Promise<void> {
        this.database = await Sqlite3DatabaseAdapter.resolveDatabase(this.options?.database ?? path.join(process.cwd(), '.cache/database.db'));

        this.database.exec(`
            CREATE TABLE IF NOT EXISTS "${this.tables.giveaways}" (
                "id" TEXT NOT NULL PRIMARY KEY,
                "guildId" TEXT NOT NULL,
                "channelId" TEXT NOT NULL,
                "messageId" TEXT NOT NULL,
                "hostId" TEXT,
                "name" TEXT NOT NULL,
                "description" TEXT,
                "winnerCount" INTEGER NOT NULL DEFAULT 1,
                "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                "paused" BOOLEAN NOT NULL DEFAULT false,
                "remaining" INTEGER,
                "ended" BOOLEAN NOT NULL DEFAULT false,
                "dueDate" DATETIME NOT NULL,
                "riggedUsersId" TEXT DEFAULT '[]',
                "winnersEntryId" TEXT NOT NULL DEFAULT '[]'
            );

            CREATE TABLE IF NOT EXISTS "${this.tables.giveawayEntries}" (
                "id" TEXT NOT NULL PRIMARY KEY,
                "giveawayId" TEXT NOT NULL,
                "userId" TEXT NOT NULL,
                "chance" INTEGER NOT NULL,
                "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                CONSTRAINT "${this.tables.giveawayEntries}_giveawayId_fkey" FOREIGN KEY ("giveawayId") REFERENCES "${this.tables.giveaways}" ("id") ON DELETE CASCADE ON UPDATE CASCADE
            );

            CREATE UNIQUE INDEX IF NOT EXISTS "${this.tables.giveaways}_id_key" ON "${this.tables.giveaways}"("id");
            CREATE UNIQUE INDEX IF NOT EXISTS "${this.tables.giveawayEntries}_id_key" ON "${this.tables.giveawayEntries}"("id");
        `);

        await super.start(manager);
    }

    public async fetchGiveaways(filter: GiveawayDatabaseAdapterDataFilterOptions<RawGiveaway>): Promise<RawGiveaway[]> {
        let query = `SELECT * FROM '${this.tables.giveaways}'`;
        let values: string[] = [];

        if (filter?.filter) {
            query += ` WHERE`;

            Object.keys(filter.filter).forEach((key, index) => {
                let value: any = filter.filter![key as keyof RawGiveaway];
                if (value === undefined) return;

                value = Sqlite3DatabaseAdapter.parseValue(value);

                query += ` ${index ? 'AND ' : ''}${key} = ?`;
                values.push(value);
            });
        }

        if (typeof filter?.count === 'number') query += `LIMIT ${filter.count}`;
        return this.database.prepare(query).all(...values).map(g => Sqlite3DatabaseAdapter.parseGiveaway(g as RawSqlite3Giveaway));
    }

    public async updateGiveaways(filter: GiveawayDatabaseAdapterDataFilterOptions<RawGiveaway>, data: Partial<RawGiveaway>): Promise<RawGiveaway[]> {
        const giveaways = await this.fetchGiveaways(filter);
        if (!giveaways.length) return [];

        let query = `UPDATE '${this.tables.giveaways}'`;
        let values: string[] = [];

        const keys = Object.keys(data);

        if (keys.length) {
            query += ` SET`;

            keys.forEach(key => {
                let value: any = data![key as keyof RawGiveaway];
                if (value === undefined) return;

                value = Sqlite3DatabaseAdapter.parseValue(value)

                query += ` ${key} = ?${key !== (keys[keys.length - 1]) ? ',' : ''}`;
                values.push(value);
            });
        }

        query += ` WHERE`;

        for (const giveaway of giveaways) {
            query += ` id = ?`;
            values.push(giveaway.id);
        }

        const newGiveaways = giveaways.map(g => ({...g, ...data}));
        const updated = this.database.prepare(query).run(...values).changes;
        if (!updated) throw new Error('Unable to update giveaways');

        for (const giveaway of newGiveaways) {
            const oldGiveaway = giveaways.find(g => g.id === giveaway.id)!;
            this.emit('giveawayUpdate', oldGiveaway, giveaway);
        }

        return newGiveaways;
    }

    public async deleteGiveaways(filter: GiveawayDatabaseAdapterDataFilterOptions<RawGiveaway>): Promise<RawGiveaway[]> {
        const giveaways = await this.fetchGiveaways(filter);
        if (!giveaways.length) return [];

        const entries = this.database.prepare(`SELECT * FROM '${this.tables.giveawayEntries}' WHERE ${giveaways.map(g => 'giveawayId = ?').join(' OR ')}`).all(...giveaways.map(g => g.id)).map(e => Sqlite3DatabaseAdapter.parseGiveawayEntry(e as RawSqlite3GiveawayEntry));
        const deleted = this.database.prepare(`DELETE FROM '${this.tables.giveaways}' WHERE ${giveaways.map(g => 'id = ?').join(' OR ')}`).run(...giveaways.map(g => g.id)).changes;
        if (!deleted) throw new Error('Unable to delete giveaways');

        for (const giveaway of giveaways) {
            for (const entry of entries.filter(e => e.giveawayId === giveaway.id)) {
                this.emit('giveawayEntryDelete', entry);
            }

            this.emit('giveawayDelete', giveaway);
        }

        return giveaways;
    }

    public async createGiveaway(data: Omit<RawGiveaway, 'id'>): Promise<RawGiveaway> {
        const id = data.messageId;

        this.database.prepare(`INSERT INTO '${this.tables.giveaways}' VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(id,
            data.guildId,
            data.channelId,
            data.messageId,
            data.hostId ?? null,
            data.name,
            data.description ?? null,
            data.winnerCount,
            data.createdAt.toISOString(),
            String(data.paused),
            data.remaining ?? null,
            String(data.ended),
            data.dueDate.toISOString(),
            JSON.stringify(data.riggedUsersId),
            JSON.stringify(data.winnersEntryId));

        const giveaway = { id, ...data };
        this.emit('giveawayCreate', giveaway);
        return giveaway;
    }

    public async fetchGiveawayEntries(filter: GiveawayDatabaseAdapterDataFilterOptions<RawGiveawayEntry>): Promise<RawGiveawayEntry[]> {
        let query = `SELECT * FROM '${this.tables.giveawayEntries}'`;
        let values: string[] = [];

        if (filter?.filter) {
            query += ` WHERE`;

            Object.keys(filter.filter).forEach((key, index) => {
                let value: any = filter.filter![key as keyof RawGiveawayEntry];
                if (value === undefined) return;

                value = Sqlite3DatabaseAdapter.parseValue(value);

                query += ` ${index ? 'AND ' : ''}${key} = ?`;
                values.push(value);
            });
        }

        if (typeof filter?.count === 'number') query += `LIMIT ${filter.count}`;
        return this.database.prepare(query).all(...values).map(g => Sqlite3DatabaseAdapter.parseGiveawayEntry(g as RawSqlite3GiveawayEntry));
    }

    public async updateGiveawayEntries(filter: GiveawayDatabaseAdapterDataFilterOptions<RawGiveawayEntry>, data: Partial<RawGiveawayEntry>): Promise<RawGiveawayEntry[]> {
        const entries = await this.fetchGiveawayEntries(filter);
        if (!entries.length) return [];

        let query = `UPDATE '${this.tables.giveawayEntries}'`;
        let values: string[] = [];

        const keys = Object.keys(data);

        if (keys.length) {
            query += ` SET`;

            keys.forEach(key => {
                let value: any = data![key as keyof RawGiveawayEntry];
                if (value === undefined) return;

                value = Sqlite3DatabaseAdapter.parseValue(value)

                query += ` ${key} = ?${key !== (keys[keys.length - 1]) ? ',' : ''}`;
                values.push(value);
            });
        }

        query += ` WHERE`;

        for (const entry of entries) {
            query += ` id = ?`;
            values.push(entry.id);
        }

        const newEntries = entries.map(g => ({...g, ...data}));
        const updated = this.database.prepare(query).run(...values).changes;
        if (!updated) throw new Error('Unable to update entries');

        for (const entry of newEntries) {
            const oldEntry = entries.find(e => e.id === entry.id)!;
            this.emit('giveawayEntryUpdate', oldEntry, entry);
        }

        return newEntries;
    }

    public async deleteGiveawayEntries(filter: GiveawayDatabaseAdapterDataFilterOptions<RawGiveawayEntry>): Promise<RawGiveawayEntry[]> {
        const entries = await this.fetchGiveawayEntries(filter);
        if (!entries.length) return [];

        const deleted = this.database.prepare(`DELETE FROM '${this.tables.giveawayEntries}' WHERE ${entries.map(e => 'id = ?').join(' OR ')}`).run(...entries.map(e => e.id)).changes;
        if (!deleted) throw new Error('Unable to delete entries');

        for (const entry of entries) {
            this.emit('giveawayEntryDelete', entry);
        }

        return entries;
    }

    public async createGiveawayEntry(data: Omit<RawGiveawayEntry, 'id'>): Promise<RawGiveawayEntry> {
        const id = Number(BigInt(Date.now()) << 22n).toString();

        this.database.prepare(`INSERT INTO '${this.tables.giveawayEntries}' VALUES (?, ?, ?, ?, ?)`).run(
            id,
            data.giveawayId,
            data.userId,
            data.chance,
            data.createdAt.toISOString()
        );

        const entry = { id, ...data };
        this.emit('giveawayEntryCreate', entry);

        return entry;
    }

    public static parseGiveaway(giveaway: RawGiveaway): RawSqlite3Giveaway;
    public static parseGiveaway(giveaway: RawSqlite3Giveaway): RawGiveaway;
    public static parseGiveaway(giveaway: RawGiveaway|RawSqlite3Giveaway): RawGiveaway|RawSqlite3Giveaway {
        return {
            ...giveaway,
            createdAt: this.parseDate(giveaway.createdAt) as any,
            paused: this.parseBoolean(giveaway.paused) as any,
            ended: this.parseBoolean(giveaway.ended) as any,
            dueDate: this.parseDate(giveaway.dueDate) as any,
            riggedUsersId: giveaway.riggedUsersId ? this.parseArray(giveaway.riggedUsersId) : (typeof giveaway.createdAt === 'string' ? undefined : null ) as any,
            winnersEntryId: this.parseArray(giveaway.winnersEntryId) as any
        };
    }

    public static parseGiveawayEntry(entry: RawGiveawayEntry): RawSqlite3GiveawayEntry;
    public static parseGiveawayEntry(entry: RawSqlite3GiveawayEntry): RawGiveawayEntry;
    public static parseGiveawayEntry(entry: RawGiveawayEntry|RawSqlite3GiveawayEntry): RawGiveawayEntry|RawSqlite3GiveawayEntry {
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

    public static parseBoolean(data: boolean): string;
    public static parseBoolean(data: string): boolean;
    public static parseBoolean(data: string|boolean): string|boolean;
    public static parseBoolean(data: string|boolean): string|boolean {
        if (typeof data === 'boolean') return String(data);

        return Boolean(data);
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

    public static parseArray<T extends any = any>(value: string): T[];
    public static parseArray<T extends any = any>(value: T[]): string;
    public static parseArray<T extends any = any>(value: string|T[]): string|T[];
    public static parseArray<T extends any = any>(value: string|T[]): string|T[] {
        return typeof value === 'string' ? JSON.parse(value) as T[] : JSON.stringify(value);
    }

    public static async resolveDatabase(database: Sqlite3DatabaseAdapterOptions['database']): Promise<Sqlite3.Database> {
        const Database = await Sqlite3DatabaseAdapter.importBetterSqlite3Database();

        let file: string|Buffer;
        let options: Sqlite3.Options|null = null;

        if (typeof database === 'string' || Buffer.isBuffer(database)) {
            file = database;
        } else if (Array.isArray(database)) {
            file = database[0];
            options = database[1];
        } else {
            return database;
        }

        return new Database(file, options ?? undefined);
    }

    public static async importBetterSqlite3Database(): Promise<typeof Sqlite3> {
        if (Sqlite3DatabaseAdapter.Database) return Sqlite3DatabaseAdapter.Database;

        const database = await import('better-sqlite3').then(d => d.default).catch(() => null);
        if (!database) throw new Error('"better-sqlite3" package is required to use sqlite3');

        Sqlite3DatabaseAdapter.Database = database;

        return database;
    }
}