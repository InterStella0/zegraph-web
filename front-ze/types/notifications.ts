export type TestPushNotification = {
    title: string,
    body: string,
    user_id: string,
};

export type CreateMapChangeSubscriptionDto = {
    server_id: string,
    subscription_id: string,
}