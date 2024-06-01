// @ts-check
import { GiveawayManager, Sqlite3DatabaseAdapter } from "@thenorthsolution/djs-giveaways";
import { SlashCommandBuilder } from "reciple";
import { userMention } from "discord.js";
import ms from "ms";

export class Giveaways {
    /**
     * @type {GiveawayManager|null}
     */
    giveaways = null;

    /**
     * @type {import("reciple").AnyCommandResolvable[]}
     */
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
                    .setRequired(true)
                )
            )
            .setExecute(async ({ interaction }) => {
                if (!interaction.inCachedGuild() || !interaction.channel || !this.giveaways) return;

                const subcommand = interaction.options.getSubcommand(true);

                if (subcommand === 'start') {
                    const name = interaction.options.getString('name', true);
                    const duration = ms(interaction.options.getString('duration', true));
                    const winners = interaction.options.getNumber('winners', true);

                    await interaction.deferReply({ ephemeral: true });

                    const giveaway = await this.giveaways.createGiveaway({
                        channel: interaction.channel,
                        endsAt: duration,
                        name,
                        winnerCount: winners
                    });

                    const message = await this.giveaways?.fetchGiveawayMessage(giveaway);
                    await interaction.editReply(message.url);
                } else if (subcommand === 'end') {
                    const giveawayId = interaction.options.getString('giveaway', true);
                    const cancel = interaction.options.getBoolean('cancel') || false;

                    await interaction.deferReply({ ephemeral: true });

                    const giveaway = (await this.giveaways.database.fetchGiveaways({ filter: { messageId: giveawayId } }))[0];
                    if (!giveaway) {
                        await interaction.editReply(`Giveaway not found`);
                        return;
                    }

                    await this.giveaways.endGiveaway(giveaway.id, cancel);
                    await interaction.editReply(`Ended giveaway`);
                } else if (subcommand === 'reroll') {
                    const giveawayId = interaction.options.getString('giveaway', true);

                    await interaction.deferReply({ ephemeral: true });

                    const giveaway = (await this.giveaways.database.fetchGiveaways({ filter: { messageId: giveawayId } }))[0];
                    if (!giveaway) {
                        await interaction.editReply(`Giveaway not found`);
                        return;
                    }

                    const winners = await this.giveaways.selectGiveawayEntries(giveaway.id, { winnerCount: giveaway.winnerCount, ignoredUsersId: giveaway.winnersEntryId });
                    const message = await this.giveaways.fetchGiveawayMessage(giveaway);

                    if (!winners.selectedEntries.length) {
                        await interaction.editReply(`No winners selected from reroll`);
                        return;
                    }

                    await message?.reply(`${winners.selectedEntries.map(e => userMention(e.userId)).join('')} won the reroll!`);
                    await interaction.editReply(`Reroll successfull`);
                }
            })
    ];

    /**
     * @param {import("reciple").RecipleModuleStartData} param0
     */
    async onStart({ client }) {
        this.giveaways = new GiveawayManager({
            database: new Sqlite3DatabaseAdapter({
                database: './database.db'
            }),
            client
        });

        return true;
    }

    /**
     * @param {import("reciple").RecipleModuleLoadData} param0 
     */
    async onLoad({ client }) {
        await this.giveaways?.start();
    }
}

export default new Giveaways();