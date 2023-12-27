import { APIActionRowComponent, APIMessageActionRowComponent, ActionRow, ActionRowBuilder, MessageActionRowComponentBuilder } from 'discord.js';
import { PageData } from './page';
import { isJSONEncodable } from 'fallout-utility';

export type ActionRowResolvable = Exclude<PageData['components'], undefined>[0];

export function resolveActionRowBuilder(actionRow: ActionRowResolvable): ActionRowBuilder<MessageActionRowComponentBuilder> {
    if (actionRow instanceof ActionRowBuilder) return actionRow;
    if (actionRow instanceof ActionRow || isJSONEncodable<APIActionRowComponent<APIMessageActionRowComponent>>(actionRow)) return ActionRowBuilder.from<MessageActionRowComponentBuilder>(actionRow);

    return new ActionRowBuilder(actionRow);
}

export function disableComponents(components: ActionRowResolvable[]): ActionRowResolvable[] {
    return components.map(a => {
        const actionRow = resolveActionRowBuilder(a).toJSON();

        actionRow.components = actionRow.components.map(i => ({ ...i, disabled: true }));
        return actionRow;
    });
}