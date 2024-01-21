// @ts-check
import ms from "ms";
import { SlashCommandBuilder, cli } from "reciple";
import { GiveawayManager, Sqlite3DatabaseAdapter } from '@falloutstudios/djs-giveaways';
import { ChatInputCommandInteraction, userMention } from "discord.js";
import { InteractionListenerType } from "reciple-interaction-events";
import path from "path";

export class Giveaways {
    versions = '^8';
    /**
     * @type {GiveawayManager<Sqlite3DatabaseAdapter>}
     */
    // @ts-expect-error
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
            .addSubcommand(pause => pause
                .setName('pause')
                .setDescription('Pauses a giveaway')
                .addStringOption(giveaway => giveaway
                    .setName('giveaway')
                    .setDescription('The giveaway you want to pause')
                    .setAutocomplete(true)
                    .setRequired(true)
                )
            )
            .addSubcommand(resume => resume
                .setName('resume')
                .setDescription('Resumes a giveaway')
                .addStringOption(giveaway => giveaway
                    .setName('giveaway')
                    .setDescription('The giveaway you want to resume')
                    .setAutocomplete(true)
                    .setRequired(true)
                )
            )
            .setExecute(async ({ interaction }) => {
                const subcommmand = interaction.options.getSubcommand(true);
                if (!interaction.inCachedGuild()) return;

                switch (subcommmand) {
                    case 'start': return this.handleGiveawayStartCommand(interaction);
                    case 'end': return this.handleGiveawayEndCommand(interaction);
                    case 'reroll': return this.handleGiveawayRerollCommand(interaction);
                    case 'pause': return this.handleGiveawayPauseCommand(interaction);
                    case 'resume': return this.handleGiveawayResumeCommand(interaction);
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
                const paused = interaction.options.getSubcommand() === 'pause'
                    ? false
                    : interaction.options.getSubcommand() === 'resume'
                        ? true
                        : undefined;

                let giveaways = await this.giveaways.database.fetchGiveaways({
                    filter: { guildId: interaction.guildId, ended, paused }
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
        if (!process.env.MONGODB) return false;

        this.giveaways = new GiveawayManager({
            client,
            database: new Sqlite3DatabaseAdapter({
                database: path.join(cli.cwd, '.cache/database.db')
            }),
        });

        this.giveaways.database.on('giveawayCreate', g => console.log(`GC:`, g));
        this.giveaways.database.on('giveawayDelete', g => console.log(`GD:`, g));
        this.giveaways.database.on('giveawayUpdate', (o, g) => console.log(`GU:`, g));
        this.giveaways.database.on('giveawayEntryCreate', e => console.log(`EC:`, e));
        this.giveaways.database.on('giveawayEntryDelete', e => console.log(`ED:`, e));
        this.giveaways.database.on('giveawayEntryUpdate', (o, e) => console.log(`EU:`, e));

        return true;
    }

    /**
     * 
     * @param {import("reciple").RecipleModuleLoadData} param0
     */
    async onLoad({ client }) {
        this.giveaways.on('error', console.log);

        await this.giveaways.start();~
        await this.giveaways.clean();
    }

    /**
     * 
     * @param {ChatInputCommandInteraction<'cached'>} interaction 
     */
    async handleGiveawayStartCommand(interaction) {
        const name = interaction.options.getString('name', true);
        const duration = ms(interaction.options.getString('duration', true));
        const winners = interaction.options.getNumber('winners', true);

        await interaction.deferReply({ ephemeral: true });

        const channel = await interaction.guild.channels.fetch(interaction.channelId).catch(() => null);
        if (!channel?.isTextBased()) {
            await interaction.editReply(`Channel not found`);
            return;
        }

        const giveaway = await this.giveaways.createGiveaway({
            channel,
            endsAt: duration,
            name,
            winnerCount: winners,
            hostId: interaction.user.id
        });

        const message = await this.giveaways.fetchGiveawayMessage(giveaway);

        await interaction.editReply(message.url);
    }

    /**
     * 
     * @param {ChatInputCommandInteraction<'cached'>} interaction 
     * @returns 
     */
    async handleGiveawayEndCommand(interaction) {
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
    }

    /**
     * 
     * @param {ChatInputCommandInteraction} interaction 
     * @returns 
     */
    async handleGiveawayRerollCommand(interaction) {
        const giveawayId = interaction.options.getString('giveaway', true);

        await interaction.deferReply({ ephemeral: true });

        const giveaway = (await this.giveaways.database.fetchGiveaways({ filter: { messageId: giveawayId } }))[0];
        if (!giveaway) {
            await interaction.editReply(`Giveaway not found`);
            return;
        }

        const winners = await this.giveaways.selectGiveawayEntries(giveaway.id, { rigged: false, ignoredUsersId: giveaway.winnersEntryId });
        const message = await this.giveaways.fetchGiveawayMessage(giveaway);

        if (!winners.selectedEntries.length) {
            await interaction.editReply(`No winners selected from reroll`);
            return;
        }

        await message.reply(`${winners.selectedEntries.map(e => userMention(e.userId)).join('')} won the reroll!`);
        await interaction.editReply(`Reroll successfull`);
    }

    /**
     * 
     * @param {ChatInputCommandInteraction} interaction 
     * @returns 
     */
    async handleGiveawayPauseCommand(interaction) {
        const giveawayId = interaction.options.getString('giveaway', true);

        await interaction.deferReply({ ephemeral: true });

        const giveaway = (await this.giveaways.database.fetchGiveaways({ filter: { messageId: giveawayId } }))[0];
        if (!giveaway) {
            await interaction.editReply(`Giveaway not found`);
            return;
        }

        await this.giveaways.pauseGiveaway(giveaway.id);
        await interaction.editReply(`Paused giveaway`);
    }

    /**
     * 
     * @param {ChatInputCommandInteraction} interaction 
     * @returns 
     */
    async handleGiveawayResumeCommand(interaction) {
        const giveawayId = interaction.options.getString('giveaway', true);

        await interaction.deferReply({ ephemeral: true });

        const giveaway = (await this.giveaways.database.fetchGiveaways({ filter: { messageId: giveawayId } }))[0];
        if (!giveaway) {
            await interaction.editReply(`Giveaway not found`);
            return;
        }

        await this.giveaways.resumeGiveaway(giveaway.id);
        await interaction.editReply(`Resumed giveaway`);
    }
};

export default new Giveaways();