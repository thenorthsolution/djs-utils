import ms from "ms";
import { SlashCommandBuilder } from "reciple";
import { GiveawayManager, MongodbDatabaseAdapter, Sqlite3DatabaseAdapter } from '@falloutstudios/djs-giveaways';
import { ChatInputCommandInteraction, userMention } from "discord.js";
import { InteractionListenerType } from "reciple-interaction-events";
import path from "path";
import { fileURLToPath } from "url";

// @ts-check

export class Giveaways {
    versions = '^8';
    /**
     * @type {GiveawayManager<MongodbDatabaseAdapter>|null}
     */
    giveaways = null;
    commands = [
        new SlashCommandBuilder()
            .setName('giveaway')
            .setDescription('Manage giveaways')
            .addSubcommand(start => start
                .setName('start')
                .setDescription('Start a new giveaway')
                .addStringOption(name => name
                    .setName('name')
                    .setDescription('The giveaway name (Giveaway prize)')
                    .setRequired(true)
                )
                .addStringOption(duration => duration
                    .setName('duration')
                    .setDescription('Giveaway duration')
                    .setRequired(true)
                )
                .addNumberOption(winners => winners
                    .setName('winners')
                    .setDescription('Number of winners')
                    .setRequired(true)
                )
            )
            .addSubcommand(end => end
                .setName('end')
                .setDescription('Ends a giveaway')
                .addStringOption(giveaway => giveaway
                    .setName('giveaway')
                    .setDescription('The giveaway you want to end')
                    .setAutocomplete(true)
                    .setRequired(true)
                )
                .addBooleanOption(cancel => cancel
                    .setName('cancel')
                    .setDescription('End giveaway without choosing winners')
                )
            )
            .addSubcommand(reroll => reroll
                .setName('reroll')
                .setDescription('Rerolls giveaway winners')
                .addStringOption(giveaway => giveaway
                    .setName('giveaway')
                    .setDescription('The giveaway you want to end')
                    .setAutocomplete(true)
                    .setRequired(true)
                )
            )
            .setExecute(async ({ interaction }) => {
                const subcommmand = interaction.options.getSubcommand(true);

                switch (subcommmand) {
                    case 'start': return this.handleGiveawayStartCommand(interaction);
                    case 'end': return this.handleGiveawayEndCommand(interaction);
                    case 'reroll': return this.handleGiveawayRerollCommand(interaction);
                }
            })
    ];

    /**
     * @type {import("reciple-interaction-events").AnyInteractionListener[]}
     */
    interactionListeners = [
        {
            type: InteractionListenerType.Autocomplete,
            commandName: 'giveaway',
            execute: async interaction => {
                if (!interaction.inGuild()) return;

                const query = interaction.options.getFocused();
                const ended = interaction.options.getSubcommand() === 'reroll';

                let giveaways = await this.giveaways.databaseAdapter.fetchGiveaways({
                    filter: { guildId: interaction.guildId, ended }
                });

                giveaways = query ? giveaways.filter(g => g.name.toLowerCase().includes(query.toLowerCase())) : giveaways;
                giveaways = giveaways.splice(0, 20);

                await interaction.respond(giveaways.map(g => ({ name: `(${g.messageId}) ${g.name}`, value: g.messageId })));
            }
        }
    ];

    /**
     * 
     * @param {import("reciple").RecipleModuleStartData} param0
     */
    onStart({ client }) {
        this.giveaways = new GiveawayManager({
            client,
            databaseAdapter: new Sqlite3DatabaseAdapter({
                file: path.join(path.dirname(fileURLToPath(import.meta.url)), '../.cache/giveaways.db'),
            }),
        });

        return true;
    }

    /**
     * 
     * @param {import("reciple").RecipleModuleLoadData} param0
     */
    async onLoad({ client }) {
        this.giveaways.on('error', console.log);

        await this.giveaways.start();
        await this.giveaways.clean();
    }

    /**
     * 
     * @param {ChatInputCommandInteraction} interaction 
     */
    async handleGiveawayStartCommand(interaction) {
        const name = interaction.options.getString('name', true);
        const duration = ms(interaction.options.getString('duration', true));
        const winners = interaction.options.getNumber('winners', true);

        await interaction.deferReply({ ephemeral: true });

        const message = await this.giveaways.createGiveaway({
            channel: interaction.channel,
            endsAt: duration,
            name,
            winnerCount: winners
        });

        await interaction.editReply(message.url);
    }

    /**
     * 
     * @param {ChatInputCommandInteraction} interaction 
     * @returns 
     */
    async handleGiveawayEndCommand(interaction) {
        const giveawayId = interaction.options.getString('giveaway', true);
        const cancel = interaction.options.getBoolean('cancel') || false;

        await interaction.deferReply({ ephemeral: true });

        const giveaway = (await this.giveaways.databaseAdapter.fetchGiveaways({ filter: { messageId: giveawayId } }))[0];
        if (!giveaway) {
            await interaction.editReply(`Giveaway not found`);
            return;
        }

        await this.giveaways.endGiveaway(giveaway.id, !cancel);
        await interaction.editReply(`Ended giveaway`);
    }

    /**
     * 
     * @param {ChatInputCommandInteraction} interaction 
     * @returns 
     */
    async handleGiveawayRerollCommand(interaction) {
        const giveawayId = interaction.options.getString('giveaway', true);

        await interaction.deferReply({ ephemeral: true });

        const giveaway = (await this.giveaways.databaseAdapter.fetchGiveaways({ filter: { messageId: giveawayId } }))[0];
        if (!giveaway) {
            await interaction.editReply(`Giveaway not found`);
            return;
        }

        const winners = await this.giveaways.getRandomGiveawayEntries(giveaway.id, giveaway.winnerCount);
        const message = await this.giveaways.getGiveawayMessage(giveaway);

        if (!winners.selected.length) {
            await interaction.editReply(`No winners selected from reroll`);
            return;
        }

        await message.reply(`${winners.selected.map(e => userMention(e.userId)).join('')} won the reroll!`);
        await interaction.editReply(`Reroll successfull`);
    }
};

export default new Giveaways();