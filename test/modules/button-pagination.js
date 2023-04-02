// @ts-check
import { CommandType } from 'reciple';
import { ButtonPaginationBuilder } from '@falloutstudios/djs-pagination';
import { ButtonBuilder, ButtonStyle, EmbedBuilder } from 'discord.js';

/**
 * @type {import("reciple").RecipleModuleScript}
 */
export default {
    versions: ['^7'],
    commands: [
        {
            commandType: CommandType.SlashCommand,
            name: 'pagination',
            description: 'Create a button pagination',
            options: [],
            execute: async ({ interaction }) => {
                const pagination = new ButtonPaginationBuilder();

                pagination.setPages([
                    new EmbedBuilder().setTitle('Page 1').setColor('Red'),
                    new EmbedBuilder().setTitle('Page 2').setColor('Green'),
                    new EmbedBuilder().setTitle('Page 3').setColor('Blue'),
                ]);

                pagination.addButton(new ButtonBuilder().setCustomId('first').setLabel('First').setStyle(ButtonStyle.Secondary), 'FirstPage');
                pagination.addButton(new ButtonBuilder().setCustomId('prev').setLabel('Previous').setStyle(ButtonStyle.Success), 'PreviousPage');
                pagination.addButton(new ButtonBuilder().setCustomId('stop').setLabel('Stop').setStyle(ButtonStyle.Danger), 'Stop');
                pagination.addButton(new ButtonBuilder().setCustomId('next').setLabel('Next').setStyle(ButtonStyle.Success), 'NextPage');
                pagination.addButton(new ButtonBuilder().setCustomId('last').setLabel('Last').setStyle(ButtonStyle.Secondary), 'LastPage');

                await pagination.paginate(interaction);
            }
        }
    ],

    async onStart(client) {
        return true;
    },

    async onLoad(client) {}
};