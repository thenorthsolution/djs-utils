# Djs Giveaways
![npm bundle size (scoped)](https://img.shields.io/bundlephobia/min/@falloutstudios/djs-giveaways?style=flat-square)
![GitHub](https://img.shields.io/github/license/FalloutStudios/djs?style=flat-square)
![npm (scoped)](https://img.shields.io/npm/v/@falloutstudios/djs-giveaways?label=Latest%20Version&style=flat-square)

A giveaway library for discord.js

## Installation

```bash
npm i @falloutstudios/djs-giveaways discord.js
```

## Usage

```js
import { GiveawayManager, JsonDatabaseAdapter } from '@falloutstudios/djs-giveaways';
import { Client } from 'discord.js';

const client = new Client({
    intents: ['Guilds', 'GuildMessages']
});

const giveaways = new GiveawayManager({
    databaseAdapter: new JsonDatabaseAdapter(),
    client
});

client.on('ready', async () => {
    await client.start();
});

client.on('interactionCreate', async interaction => {
    if (!interaction.isChatInputCommand() || interaction.commandName !== 'giveaway') return;

    const subcommmand = interaction.options.getSubcommand(true);

    if (subcommand === 'start') {
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
    } else if (subcommand === 'end') {
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
    } else if (subcommand === 'reroll') {
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
});

client.login(`TOKEN`);
```