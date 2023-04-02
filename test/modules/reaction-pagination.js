// @ts-check
import { ReactionPaginationBuilder } from '@falloutstudios/djs-pagination';
import { EmbedBuilder } from 'discord.js';
import { CommandType } from 'reciple';

/**
 * @type {import("reciple").RecipleModuleScript}
 */
export default {
    versions: ['^7'],
    commands : [
        {
            commandType: CommandType.MessageCommand,
            name: 'pagination',
            description: 'Reaction Pagination',
            aliases: [],
            dmPermission: true,
            userBotPermission: false,
            validateOptions: true,
            options: [],
            execute: async ({ message }) => {
                const pagination = new ReactionPaginationBuilder();

                pagination.setPages([
                    new EmbedBuilder().setTitle('Page 1').setColor('Red'),
                    new EmbedBuilder().setTitle('Page 2').setColor('Green'),
                    new EmbedBuilder().setTitle('Page 3').setColor('Blue'),
                ]);

                pagination.addReaction('⏪', 'FirstPage');
                pagination.addReaction('⬅️', 'PreviousPage');
                pagination.addReaction('🛑', 'Stop');
                pagination.addReaction('➡', 'NextPage');
                pagination.addReaction('⏩', 'LastPage');

                await pagination.paginate(message);
            }
        }
    ],

    async onStart(client) {
        return true;
    },

    async onLoad(client) {}
};