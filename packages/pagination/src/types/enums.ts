export function getEnumValue<Enum>(enum_: Enum, key: string|number): number {
    // @ts-expect-error
    return typeof key === 'string' ? enum_[key] : key;
}

export enum SendAs {
    NewMessage = 1,
    EditMessage,
    ReplyMessage
}

export enum PaginationControllerType {
    FirstPage = 1,
    PreviousPage,
    NextPage,
    LastPage,
    Stop
}