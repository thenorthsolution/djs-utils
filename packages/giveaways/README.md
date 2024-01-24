# Djs Giveaways
![npm bundle size (scoped)](https://img.shields.io/bundlephobia/min/@falloutstudios/djs-giveaways?style=flat-square)
![GitHub](https://img.shields.io/github/license/FalloutStudios/djs?style=flat-square)
![npm (scoped)](https://img.shields.io/npm/v/@falloutstudios/djs-giveaways?label=Latest%20Version&style=flat-square)

A giveaway library for discord.js

## Installation

```bash
npm i @falloutstudios/djs-giveaways discord.js
```

## Available Database Adapter

- [`JsonDatabaseAdapter`](https://falloutstudios.github.io/djs/classes/_falloutstudios_djs_giveaways.JsonDatapaseAdapter.html)
- [`MongodbDatabaseAdapter`](https://falloutstudios.github.io/djs/classes/_falloutstudios_djs_giveaways.MongodbDatabaseAdapter.html)
- [`Sqlite3DatabaseAdapter`](https://falloutstudios.github.io/djs/classes/_falloutstudios_djs_giveaways.Sqlite3DatabaseAdapter.html)

## Usage

```js
// @ts-check
import { GiveawayManager, MongodbDatabaseAdapter } from '@falloutstudios/djs-giveaways';
import { Client, SlashCommandBuilder, userMention } from 'discord.js';
import ms from 'ms';

// The discord bot client
const client = new Client({
    intents: ['Guilds', 'GuildMessages']
});

// The giveaway manager
const giveaways = new GiveawayManager({
    database: new MongodbDatabaseAdapter({
        mongooseConnection: `mongodb://username:password@host:port/database`
    }),
    client
});

client.on('ready', async () => {
    // Slash command
    const command = new SlashCommandBuilder()
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
        );

    // Register command globally
    await client.application?.commands.set([command]);
    // Start giveaway listeners
    await giveaways.start();
});

client.on('interactionCreate', async interaction => {
    if (!interaction.isChatInputCommand() || interaction.commandName !== 'giveaway' || !interaction.inCachedGuild() || !interaction.channel) return;

    const subcommand = interaction.options.getSubcommand(true);

    if (subcommand === 'start') {
        const name = interaction.options.getString('name', true);
        const duration = ms(interaction.options.getString('duration', true));
        const winners = interaction.options.getNumber('winners', true);

        await interaction.deferReply({ ephemeral: true });

        const giveaway = await giveaways.createGiveaway({
            channel: interaction.channel,
            endsAt: duration,
            name,
            winnerCount: winners
        });

        const message = await giveaways.fetchGiveawayMessage(giveaway);
        await interaction.editReply(message.url);
    } else if (subcommand === 'end') {
        const giveawayId = interaction.options.getString('giveaway', true);
        const cancel = interaction.options.getBoolean('cancel') || false;

        await interaction.deferReply({ ephemeral: true });

        const giveaway = (await giveaways.database.fetchGiveaways({ filter: { messageId: giveawayId } }))[0];
        if (!giveaway) {
            await interaction.editReply(`Giveaway not found`);
            return;
        }

        await giveaways.endGiveaway(giveaway.id, cancel);
        await interaction.editReply(`Ended giveaway`);
    } else if (subcommand === 'reroll') {
        const giveawayId = interaction.options.getString('giveaway', true);

        await interaction.deferReply({ ephemeral: true });

        const giveaway = (await giveaways.database.fetchGiveaways({ filter: { messageId: giveawayId } }))[0];
        if (!giveaway) {
            await interaction.editReply(`Giveaway not found`);
            return;
        }

        const winners = await giveaways.selectGiveawayEntries(giveaway.id, { winnerCount: giveaway.winnerCount, ignoredUsersId: giveaway.winnersEntryId });
        const message = await giveaways.fetchGiveawayMessage(giveaway);

        if (!winners.selectedEntries.length) {
            await interaction.editReply(`No winners selected from reroll`);
            return;
        }

        await message?.reply(`${winners.selectedEntries.map(e => userMention(e.userId)).join('')} won the reroll!`);
        await interaction.editReply(`Reroll successfull`);
    }
});

client.login(`TOKEN`);
```