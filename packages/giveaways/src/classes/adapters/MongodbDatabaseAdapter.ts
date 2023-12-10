import { InferSchemaType, Model, Mongoose, Schema } from 'mongoose';
import { BaseDatabaseAdapter } from '../BaseDatabaseAdapter';
import { IGiveaway, IGiveawayEntry } from '../../types/giveaway';
import { JSONEncodable, isJSONEncodable } from 'discord.js';
import { GiveawayManager } from '../GiveawayManager';
import { mapKeys, snakeCase } from 'lodash';

export interface MongodbDatabaseAdapterOptions {
    mongooseConnection: Mongoose|string;
    giveawaysModel?: Model<RawMongodbGiveaway>;
    giveawayEntriesModel?: Model<RawMongodbGiveawayEntry>;
}

export type RawMongodbGiveaway = InferSchemaType<MongodbDatabaseAdapter['giveawaySchema']>;
export type RawMongodbGiveawayEntry = InferSchemaType<MongodbDatabaseAdapter['giveawayEntrySchema']>;

export class MongodbDatabaseAdapter extends BaseDatabaseAdapter {
    public mongoose?: Mongoose;
    public giveawaysModel!: Model<RawMongodbGiveaway>;
    public giveawayEntriesModel!: Model<RawMongodbGiveawayEntry>;

    constructor(readonly options: MongodbDatabaseAdapterOptions) {
        super();
    }

    public async start(manager: GiveawayManager<this>): Promise<void> {
        if (typeof this.options.mongooseConnection !== 'string') {
            this.mongoose ??= this.options.mongooseConnection;
        } else {
            const mongoose = await import('mongoose');
            this.mongoose ??= await mongoose.connect(this.options.mongooseConnection);
        }

        this.giveawaysModel = this.options.giveawaysModel ?? this.mongoose.model('Giveaways', this.giveawaySchema, 'Giveaways');
        this.giveawayEntriesModel = this.options.giveawayEntriesModel ?? this.mongoose.model('GiveawayEntries', this.giveawayEntrySchema, 'GiveawayEntries');

        await super.start(manager);
    }

    public async fetchGiveaways(options?: { filter?: Partial<IGiveaway>, count?: number }): Promise<IGiveaway[]> {
        const data = await this.giveawaysModel.find({
            ...(options?.filter ? MongodbDatabaseAdapter.parseGiveawayObject(options.filter) : {})
        }, null, { limit: options?.count });

        return data.map(d => MongodbDatabaseAdapter.parseGiveawayDocument(d));
    }


    public async fetchGiveaway(giveawayId: string): Promise<IGiveaway|undefined> {
        const data = await this.giveawaysModel.findOne({
            id: giveawayId
        });

        return data ? MongodbDatabaseAdapter.parseGiveawayDocument(data) : undefined;
    }

    public async createGiveaway(data: IGiveaway): Promise<IGiveaway> {
        const newData = await this.giveawaysModel.create(MongodbDatabaseAdapter.parseGiveawayObject(data));
        this.emit('giveawayCreate', data);
        return MongodbDatabaseAdapter.parseGiveawayDocument(newData);
    }

    public async updateGiveaway(giveawayId: string, data: Partial<IGiveaway>): Promise<IGiveaway> {
        const giveaway = await this.fetchGiveaway(giveawayId);
        if (!giveaway) throw new Error(`Unable to update giveaway! Giveaway id not found: ${giveawayId}`);

        const updated = await this.giveawaysModel.updateOne({ id: giveawayId }, MongodbDatabaseAdapter.parseGiveawayObject(data));
        if (!updated.modifiedCount) throw new Error(`Unable to update giveaway! Giveaway id not found: ${giveawayId}`);

        const newGiveaway = (await this.fetchGiveaway(giveawayId))!;
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

        await this.giveawayEntriesModel.deleteMany({
            $or: giveaways.map(e => ({ giveaway_id: e.id }))
        });

        await this.giveawaysModel.deleteMany({
            $or: giveaways.map(g => ({ id: g.id }))
        });

        giveaways.forEach(g => this.emit('giveawayDelete', g));

        return findFirst ? giveaways[0] : giveaways;
    }


    public async fetchGiveawayEntries(options: { filter?: Partial<IGiveawayEntry>; count?: number; }): Promise<IGiveawayEntry[]> {
        const data = await this.giveawayEntriesModel.find({
            ...(options?.filter ? MongodbDatabaseAdapter.parseGiveawayEntryObject(options?.filter) : {})
        }, null, { limit: options?.count });

        return data.map(d => MongodbDatabaseAdapter.parseGiveawayEntryDocument(d));
    }

    public async fetchGiveawayEntry(entryId: string): Promise<IGiveawayEntry|undefined> {
        const data = await this.giveawayEntriesModel.findOne({
            id: entryId
        });

        return data ? MongodbDatabaseAdapter.parseGiveawayEntryDocument(data) : undefined;
    }

    public async createGiveawayEntry(giveawayId: string, data: IGiveawayEntry): Promise<IGiveawayEntry> {
        const giveaway = await this.fetchGiveaway(giveawayId);
        if (!giveaway) throw new Error(`Unable to create new giveaway`);

        const newData = await this.giveawayEntriesModel.create(MongodbDatabaseAdapter.parseGiveawayEntryObject(data));
        this.emit('giveawayEntryCreate', data);
        return MongodbDatabaseAdapter.parseGiveawayEntryDocument(newData);
    }

    public async updateGiveawayEntry(entryId: string, data: Partial<IGiveawayEntry>): Promise<IGiveawayEntry> {
        const entry = await this.fetchGiveawayEntry(entryId);
        if (!entry) throw new Error(`Unable to update giveaway entry! Entry id not found: ${entryId}`);

        const updated = await this.giveawayEntriesModel.updateOne({ id: entryId }, MongodbDatabaseAdapter.parseGiveawayEntryObject(data));
        if (!updated.modifiedCount) throw new Error(`Unable to update giveaway entry! Entry id not found: ${entryId}`);

        const newEntry = (await this.fetchGiveawayEntry(entryId))!;
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

        await this.giveawayEntriesModel.deleteMany({
            $or: entries.map(e => ({ id: e.id }))
        });

        entries.forEach(e => this.emit('giveawayEntryDelete', e));

        return findFirst ? entries[0] : entries;
    }

    // Static

    public static parseGiveawayDocument(document: RawMongodbGiveaway|JSONEncodable<RawMongodbGiveaway>): IGiveaway {
        const data = isJSONEncodable(document) ? document.toJSON() : document;

        return {
            id: data.id,
            guildId: data.guild_id,
            channelId: data.channel_id,
            messageId: data.message_id,
            authorId: data.author_id ?? undefined,
            name: data.name,
            winnerCount: data.winner_count,
            endsAt: data.ends_at,
            createdAt: data.created_at,
            ended: data.ended ?? false,
            endedAt: data.ended_at ?? null,
            winnersEntryId: data.winners_entry_id,
        };
    }

    public static parseGiveawayObject(data: IGiveaway|JSONEncodable<IGiveaway>): RawMongodbGiveaway;
    public static parseGiveawayObject(data: Partial<IGiveaway>|JSONEncodable<Partial<IGiveaway>>): Partial<RawMongodbGiveaway>;
    public static parseGiveawayObject(data: IGiveaway|JSONEncodable<IGiveaway>|Partial<IGiveaway>|JSONEncodable<Partial<IGiveaway>>): RawMongodbGiveaway|Partial<RawMongodbGiveaway> {
        data = isJSONEncodable(data) ? data.toJSON() : data;
        return mapKeys(data, (value, key) => snakeCase(key));
    }

    public static parseGiveawayEntryDocument(document: RawMongodbGiveawayEntry|JSONEncodable<RawMongodbGiveawayEntry>): IGiveawayEntry {
        const data = isJSONEncodable(document) ? document.toJSON() : document;

        return {
            id: data.id,
            giveawayId: data.giveaway_id,
            userId: data.user_id,
            createdAt: data.created_at,
        };
    }

    public static parseGiveawayEntryObject(data: IGiveawayEntry|JSONEncodable<IGiveawayEntry>): RawMongodbGiveawayEntry
    public static parseGiveawayEntryObject(data: Partial<IGiveawayEntry>|JSONEncodable<Partial<IGiveawayEntry>>): Partial<RawMongodbGiveawayEntry>;
    public static parseGiveawayEntryObject(data: IGiveawayEntry|JSONEncodable<IGiveawayEntry>|Partial<IGiveawayEntry>|JSONEncodable<Partial<IGiveawayEntry>>): RawMongodbGiveawayEntry|Partial<RawMongodbGiveawayEntry> {
        data = isJSONEncodable(data) ? data.toJSON() : data;
        return mapKeys(data, (value, key) => snakeCase(key));
    }

    public static ObjectId = Schema.ObjectId;
    public static giveawaySchema = new Schema({
        id: { type: String, required: true },
        guild_id: { type: String, required: true },
        channel_id: { type: String, required: true },
        message_id: { type: String, required: true },
        author_id: String,
        name: { type: String, required: true },
        winner_count: { type: Number, required: true },
        ends_at: { type: Date, required: true },
        created_at: { type: Date, required: true, default: Date.now },
        ended: { type: Boolean, required: true, default: false },
        ended_at: Date,
        winners_entry_id: [
            { type: String, required: true }
        ],
    });

    public static giveawayEntrySchema = new Schema({
        id: { type: String, required: true },
        giveaway_id: { type: String, required: true },
        user_id: { type: String, required: true },
        created_at: { type: Date, required: true, default: Date.now },
    });

    public giveawaySchema = MongodbDatabaseAdapter.giveawaySchema;
    public giveawayEntrySchema = MongodbDatabaseAdapter.giveawayEntrySchema;
}