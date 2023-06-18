import ms from "ms";
import { RecipleClient, SlashCommandBuilder } from "reciple";
import { GiveawayManager, JsonDatapaseAdapter } from '@falloutstudios/djs-giveaways';
import path from "path";
import { fileURLToPath } from "url";
import { userMention } from "discord.js";

// @ts-check

export class Giveaways {
    versions = '^7';
    /**
     * @type {GiveawayManager|null}
     */
    giveaways = null;
    commands = [
        new SlashCommandBuilder()
            .setName('start-giveaway')
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
            .setExecute(async ({ interaction }) => {
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
            }),
        new SlashCommandBuilder()
            .setName('end-giveaway')
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
            .setExecute(async ({ interaction }) => {
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
            }),
        new SlashCommandBuilder()
            .setName('reroll-giveaway')
            .setDescription('Rerolls giveaway winners')
            .addStringOption(giveaway => giveaway
                .setName('giveaway')
                .setDescription('The giveaway you want to end')
                .setRequired(true)
            )
            .setExecute(async ({ interaction }) => {
                const giveawayId = interaction.options.getString('giveaway', true);
                const cancel = interaction.options.getBoolean('cancel') || false;

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
            })
    ];

    /**
     * 
     * @param {RecipleClient} client 
     * @returns 
     */
    onStart(client) {
        this.giveaways = new GiveawayManager({
            client,
            databaseAdapter: new JsonDatapaseAdapter({
                file: path.join(path.dirname(fileURLToPath(import.meta.url)), '../.cache/giveaways.json'),
                parser: {
                    parse: JSON.parse,
                    stringify: data => JSON.stringify(data, null, 2)
                }
            }),
        });

        return true;
    }

    /**
     * 
     * @param {RecipleClient} client 
     */
    async onLoad(client) {
        this.giveaways.on('error', err => client.logger.error(err));

        await this.giveaways.start();
        await this.giveaways.clean();
    }
};

export default new Giveaways();