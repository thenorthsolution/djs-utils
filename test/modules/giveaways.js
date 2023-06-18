import ms from "ms";
import { RecipleClient, SlashCommandBuilder } from "reciple";
import { GiveawayManager, JsonDatapaseAdapter } from '@falloutstudios/djs-giveaways';
import path from "path";
import { fileURLToPath } from "url";

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