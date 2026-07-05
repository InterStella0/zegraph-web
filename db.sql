CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS btree_gist;
CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION "pg_cron"; -- only do THIS ONE EXTENSION on your selected database for PG_CRON extension

CREATE TABLE player(
    player_id VARCHAR(100) PRIMARY KEY,
    player_name TEXT NOT NULL,
    location_code JSONB,
    location GEOMETRY,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    associated_player_id REFERENCES player(player_id) ON DELETE SET NULL
);
CREATE INDEX idx_player_name_trgm ON player USING gin (player_name gin_trgm_ops);

CREATE TABLE player_activity(
    player_id VARCHAR(100) REFERENCES player(player_id) ON DELETE CASCADE,
    event_name VARCHAR(10) NOT NULL,
    event_value TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE community(
    community_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    community_name TEXT,
    community_shorten_name VARCHAR(20),
    community_icon_url TEXT
);
CREATE TABLE server_browser(
    ip TEXT NOT NULL,
    port SMALLINT NOT NULL,
    tracking BOOLEAN NOT NULL DEFAULT TRUE,
    cooldown_type VARCHAR(20) NOT NULL DEFAULT 'unknown' CHECK (cooldown_type IN ('unknown', 'datetime', 'map_count')),
    UNIQUE(ip, port)
);
CREATE TABLE server(
    server_id VARCHAR(100) PRIMARY KEY,
    server_name TEXT,
    server_ip VARCHAR(100),
    server_fullname TEXT,
    server_port INTEGER,
    max_players SMALLINT,
    online BOOLEAN DEFAULT false,
    community_id UUID REFERENCES community(community_id) ON DELETE SET NULL,
    readable_link VARCHAR(20) UNIQUE,
    last_polled_at TIMESTAMPTZ,
);

CREATE TABLE server_fetch_status (
    fetch_id BIGSERIAL PRIMARY KEY,
    server_id VARCHAR(100) NOT NULL REFERENCES server(server_id) ON DELETE CASCADE,
    op_name VARCHAR(20) NOT NULL,
    source_name VARCHAR(20) NOT NULL,
    fetched_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    ok BOOLEAN NOT NULL,
    error TEXT
);
CREATE INDEX idx_server_fetch_status_server_time
    ON server_fetch_status (server_id, fetched_at DESC);
CREATE INDEX idx_server_fetch_status_op_source_time
    ON server_fetch_status (server_id, op_name, source_name, fetched_at DESC);


CREATE TABLE server_metadata(
    server_id VARCHAR(100) REFERENCES server(server_id) ON DELETE CASCADE,
    server_website VARCHAR(500),
    server_discord_link VARCHAR(100),
    server_source VARCHAR(100),
    timezone VARCHAR(50),
    game VARCHAR(15) DEFAULT '730_cs2',
    source_by_id BOOLEAN DEFAULT FALSE
);
CREATE TABLE player_admin(
    server_id VARCHAR(100) REFERENCES server(server_id) ON DELETE CASCADE,
    player_id VARCHAR(100) REFERENCES player(player_id) ON DELETE CASCADE,
    UNIQUE(player_id, server_id)
);
CREATE TABLE player_server_activity(
    player_id VARCHAR(100) REFERENCES player(player_id) ON DELETE CASCADE,
    server_id VARCHAR(100) REFERENCES server(server_id) ON DELETE CASCADE,
    event_name VARCHAR(10) NOT NULL,
    event_value TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE discord_user(
    user_id BIGINT PRIMARY KEY,
    display_name VARCHAR(100),
    avatar TEXT,
    joined_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE player_user(
    user_id BIGINT REFERENCES discord_user ON DELETE CASCADE,
    player_id VARCHAR(100) REFERENCES player ON DELETE CASCADE,
    UNIQUE(user_id, player_id)
);

CREATE TABLE admin_join_mention(
    user_id BIGINT REFERENCES discord_user(user_id) ON DELETE CASCADE,
    server_id VARCHAR(100) REFERENCES server(server_id) ON DELETE CASCADE,
    guild_id BIGINT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, guild_id, server_id)
);

CREATE TABLE server_map_played(
    time_id SERIAL PRIMARY KEY,
    server_id VARCHAR(100) REFERENCES server(server_id) ON DELETE CASCADE,
    map VARCHAR(100) NOT NULL,
    player_count INT NOT NULL,
    started_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    ended_at TIMESTAMP WITH TIME ZONE
);
CREATE INDEX idx_sm_server_time ON server_map_played(server_id, started_at, ended_at);
CREATE INDEX idx_smp_timerange ON server_map_played
    USING gist (server_id, map, tstzrange(started_at, ended_at));


-- REQUIRED FORCE AS RELYING ON A PROCESS IS UNRELIABLE
CREATE OR REPLACE FUNCTION close_previous_maps()
RETURNS TRIGGER AS $$
BEGIN
UPDATE server_map_played
SET ended_at = CURRENT_TIMESTAMP
WHERE server_id = NEW.server_id
  AND ended_at IS NULL;

RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_close_previous_maps
    BEFORE INSERT ON server_map_played
    FOR EACH ROW
    EXECUTE FUNCTION close_previous_maps();


CREATE TABLE admin_info(
    admin_id BIGINT PRIMARY KEY,
    admin_name VARCHAR(1000) NOT NULL,
    avatar_id VARCHAR(1000),
    permissions BIGINT,
    last_update TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE server_infractions(
    infraction_id VARCHAR(100) NOT NULL,
    source TEXT NOT NULL,
    payload JSONB NOT NULL,
    created TIMESTAMP WITH TIME ZONE NOT NULL,
    message_url TEXT,
    pending_update BOOLEAN NOT NULL DEFAULT false
);

CREATE TABLE player_server_session(
    session_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    player_id VARCHAR(100) REFERENCES player(player_id) ON DELETE CASCADE NOT NULL,
    server_id VARCHAR(100) REFERENCES server(server_id) ON DELETE CASCADE NOT NULL,
    started_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
    ended_at TIMESTAMP WITH TIME ZONE,
    last_verified TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_pss_timerange ON player_server_session
    USING gist (server_id, tstzrange(started_at, ended_at));

CREATE INDEX idx_session_times
    ON player_server_session (started_at, ended_at);

CREATE INDEX idx_player_id
    ON player_server_session (player_id);

CREATE INDEX idx_player_server_session_server_id_player_id_started_ended
    ON player_server_session (server_id, player_id, started_at, ended_at);

CREATE INDEX idx_player_server_session_started_at
    ON player_server_session (started_at);


CREATE SCHEMA website;

CREATE TABLE website.discord_user(
    user_id BIGINT PRIMARY KEY REFERENCES discord_user(user_id) ON DELETE CASCADE NOT NULL,
    refresh_token TEXT
);

CREATE TYPE community_visibility_state_enum AS ENUM (
    'Private',
    'FriendsOnly',
    'Public'
);

CREATE TYPE persona_state_enum AS ENUM (
    'Offline',
    'Online',
    'Busy',
    'Away',
    'Snooze',
    'LookingToTrade',
    'LookingToPlay'
);


CREATE TABLE website.steam_user (
    user_id BIGINT PRIMARY KEY,
    community_visibility_state community_visibility_state_enum NOT NULL,
    profile_state INTEGER NOT NULL,
    persona_name TEXT NOT NULL,
    profile_url TEXT NOT NULL,
    avatar TEXT NOT NULL,
    avatar_medium TEXT NOT NULL,
    avatar_full TEXT NOT NULL,
    avatar_hash TEXT NOT NULL,
    last_log_off BIGINT NOT NULL,
    persona_state persona_state_enum NOT NULL,
    primary_clan_id TEXT NOT NULL,
    time_created BIGINT NOT NULL,
    persona_state_flags INTEGER NOT NULL,
    comment_permission BOOLEAN NOT NULL
);

CREATE TABLE website.user_favorite_maps (
    user_id BIGINT REFERENCES website.steam_user(user_id) ON DELETE CASCADE,
    server_id VARCHAR(100),
    map TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (user_id, server_id, map),
    FOREIGN KEY (server_id, map)
        REFERENCES server_map(server_id, map)
        ON DELETE CASCADE
);


CREATE TABLE IF NOT EXISTS website.map_3d_model (
    id SERIAL PRIMARY KEY,
    map_name VARCHAR(255) NOT NULL,
    res_type VARCHAR(10) NOT NULL CHECK (res_type IN ('low', 'high')),
    credit TEXT,
    link_path TEXT NOT NULL,
    uploaded_by BIGINT REFERENCES website.steam_user(user_id) ON DELETE SET NULL,
    file_size BIGINT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(map_name, res_type)
);

CREATE INDEX idx_map_3d_model_map_name ON website.map_3d_model(map_name);
CREATE INDEX idx_map_3d_model_uploaded_by ON website.map_3d_model(uploaded_by);

COMMENT ON TABLE website.map_3d_model IS 'Stores metadata for uploaded 3D models (.glb files) for maps';
COMMENT ON COLUMN website.map_3d_model.res_type IS 'Resolution type: low or high';
COMMENT ON COLUMN website.map_3d_model.credit IS 'Optional credit/attribution for the model author';
COMMENT ON COLUMN website.map_3d_model.link_path IS 'File path on disk (e.g., maps/{map_name}/{map_name}_d_c_{res_type}.glb)';
COMMENT ON COLUMN website.map_3d_model.file_size IS 'File size in bytes';


CREATE TABLE IF NOT EXISTS website.character_3d_model (
    id SERIAL PRIMARY KEY,
    model_id VARCHAR(255) NOT NULL,
    name VARCHAR(255),
    server_id VARCHAR(100) NOT NULL REFERENCES server(server_id) ON DELETE CASCADE,
    credit TEXT,
    link_path TEXT NOT NULL,
    uploaded_by BIGINT REFERENCES website.steam_user(user_id) ON DELETE SET NULL,
    file_size BIGINT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(server_id, model_id)
);

CREATE INDEX IF NOT EXISTS idx_character_3d_model_model_id ON website.character_3d_model(model_id);
CREATE INDEX IF NOT EXISTS idx_character_3d_model_uploaded_by ON website.character_3d_model(uploaded_by);

COMMENT ON TABLE website.character_3d_model IS 'Stores metadata for uploaded 3D character models (.glb files)';
COMMENT ON COLUMN website.character_3d_model.model_id IS 'Character model identifier used for file paths and URLs (e.g., zombie_runner)';
COMMENT ON COLUMN website.character_3d_model.name IS 'Human-readable display name (e.g., Zombie Runner)';
COMMENT ON COLUMN website.character_3d_model.server_id IS 'Server this character model belongs to';
COMMENT ON COLUMN website.character_3d_model.credit IS 'Optional credit/attribution for the model author';
COMMENT ON COLUMN website.character_3d_model.link_path IS 'File path or URL for the model';
COMMENT ON COLUMN website.character_3d_model.file_size IS 'File size in bytes';


CREATE TABLE IF NOT EXISTS website.user_refresh_tokens (
    user_id BIGINT PRIMARY KEY REFERENCES discord_user(user_id) ON DELETE CASCADE NOT NULL,
    refresh_token_hash VARCHAR(64) NOT NULL,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT current_timestamp,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT current_timestamp,
    device_id TEXT NOT NULL,
    UNIQUE (user_id, device_id)
);

CREATE INDEX IF NOT EXISTS idx_refresh_tokens_expires_at
    ON website.user_refresh_tokens(expires_at);

CREATE OR REPLACE FUNCTION cleanup_expired_refresh_tokens()
    RETURNS INTEGER AS $$
    DECLARE
    deleted_count INTEGER;
    BEGIN
        DELETE FROM website.user_refresh_tokens
        WHERE expires_at < NOW();

        GET DIAGNOSTICS deleted_count = ROW_COUNT;
        RETURN deleted_count;
    END;
$$ LANGUAGE plpgsql;


CREATE TABLE website.player_server_worker(
    player_id VARCHAR(100) REFERENCES player(player_id) ON DELETE CASCADE NOT NULL,
    server_id VARCHAR(100) REFERENCES server(server_id) ON DELETE CASCADE NOT NULL,
    type VARCHAR(30) NOT NULL,
    last_calculated UUID REFERENCES player_server_session(session_id) ON DELETE CASCADE NOT NULL,
    PRIMARY KEY(player_id, server_id, type)
);
CREATE TABLE website.player_server_relationship(
    player_id VARCHAR(100) REFERENCES player(player_id) ON DELETE CASCADE NOT NULL,
    meet_player_id VARCHAR(100) REFERENCES player(player_id) ON DELETE CASCADE NOT NULL,
    server_id VARCHAR(100) REFERENCES server(server_id) ON DELETE CASCADE NOT NULL,
    total_time_together INTERVAL DEFAULT INTERVAL '0 seconds',
    last_seen TIMESTAMP WITH TIME ZONE,
    PRIMARY KEY(player_id, meet_player_id, server_id)
);

CREATE TABLE website.player_playtime(
    server_id VARCHAR(100) REFERENCES server(server_id) ON DELETE CASCADE NOT NULL,
    player_id VARCHAR(100) REFERENCES player(player_id) ON DELETE CASCADE NOT NULL,
    total_playtime INTERVAL NOT NULL DEFAULT INTERVAL '0 seconds',
    casual_playtime INTERVAL NOT NULL DEFAULT INTERVAL '0 seconds',
    tryhard_playtime INTERVAL NOT NULL DEFAULT INTERVAL '0 seconds',
    category VARCHAR(8),
    sum_key TEXT,
    PRIMARY KEY(player_id, server_id)
);


CREATE TABLE website.kofi_donors (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    display_name TEXT NOT NULL,
    amount      NUMERIC(10, 2) NOT NULL DEFAULT 0,
    message     TEXT,
    donated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);


CREATE TABLE website.special_thanks (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    display_name TEXT NOT NULL,
    description  TEXT NOT NULL,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);


CREATE TABLE website.ze_community_links (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name        TEXT NOT NULL,
    url         TEXT NOT NULL,
    description TEXT,
    sort_order  INT NOT NULL DEFAULT 0,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);



CREATE TABLE website.player_map_time(
    server_id VARCHAR(100) REFERENCES server(server_id) ON DELETE CASCADE NOT NULL,
    player_id VARCHAR(100) REFERENCES player(player_id) ON DELETE CASCADE NOT NULL,
    map VARCHAR(100) NOT NULL,
    total_playtime INTERVAL NOT NULL DEFAULT INTERVAL '0 seconds',
    PRIMARY KEY(player_id, server_id, map)
);

CREATE TABLE website.map_analyze(
    server_id VARCHAR(100),
    map TEXT,
    total_playtime INTERVAL NOT NULL DEFAULT INTERVAL '0 seconds',
    total_sessions INT NOT NULL DEFAULT 0,
    unique_players INT NOT NULL DEFAULT 0,
    cum_player_hours INTERVAL NOT NULL DEFAULT INTERVAL '0 seconds',
    last_played TIMESTAMP WITH TIME ZONE NOT NULL,
    last_played_ended TIMESTAMP WITH TIME ZONE,
    dropoff_rate DOUBLE PRECISION DEFAULT 0,
    avg_playtime_before_quitting INTERVAL NOT NULL DEFAULT INTERVAL '0 seconds',
    avg_players_per_session DOUBLE PRECISION DEFAULT 0,
    PRIMARY KEY (server_id, map),
    FOREIGN KEY (server_id, map) REFERENCES server_map(server_id, map) ON DELETE CASCADE
);


CREATE TABLE website.map_session_distribution(
    server_id VARCHAR(100),
    map TEXT,
    session_range TEXT,
    session_count INT NOT NULL,
    PRIMARY KEY (server_id, map, session_range),
    FOREIGN KEY (server_id, map) REFERENCES server_map(server_id, map) ON DELETE CASCADE
);
CREATE TYPE announcement_type_enum AS ENUM (
    'Rich',
    'Basic'
);

CREATE TABLE website.announce(
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    text TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT current_timestamp,
    show BOOLEAN NOT NULL DEFAULT TRUE,
    type announcement_type_enum NOT NULL DEFAULT 'Basic',
    title TEXT,
    published_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP WITH TIME ZONE
);
CREATE MATERIALIZED VIEW website.player_playtime_ranks AS
SELECT player_id,
       server_id,
       RANK() OVER (ORDER BY total_playtime DESC) AS global_playtime_rank,
       RANK() OVER (PARTITION BY server_id ORDER BY total_playtime DESC) AS playtime_rank,
       RANK() OVER (PARTITION BY server_id ORDER BY casual_playtime DESC) AS casual_rank,
       RANK() OVER (PARTITION BY server_id ORDER BY tryhard_playtime DESC) AS tryhard_rank
FROM website.player_playtime;

CREATE UNIQUE INDEX CONCURRENTLY player_playtime_ranks_idx
    ON website.player_playtime_ranks (player_id, server_id);


CREATE MATERIALIZED VIEW website.player_map_rank AS
SELECT
    server_id,
    player_id,
    map,
    RANK() OVER (
    PARTITION BY server_id, map
    ORDER BY total_playtime DESC
  ) AS map_rank
FROM website.player_map_time;
CREATE UNIQUE INDEX CONCURRENTLY player_map_rank_idx
    ON website.player_map_rank (server_id, map, player_id);

CREATE TABLE website.user_roles (
    user_id BIGINT REFERENCES website.steam_user(user_id) ON DELETE CASCADE,
    role VARCHAR(20) NOT NULL CHECK (role IN ('superuser', 'community_admin', 'regular', 'map_manager')),
    community_id UUID REFERENCES community(community_id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, community_id),
    CONSTRAINT role_community_check CHECK (
        (role = 'community_admin' AND community_id IS NOT NULL) OR
        (role IN ('superuser', 'regular', 'map_manager') AND community_id IS NULL)
        )
);

CREATE INDEX idx_user_roles_user_id ON website.user_roles(user_id);
CREATE INDEX idx_user_roles_community ON website.user_roles(community_id) WHERE community_id IS NOT NULL;

CREATE TABLE website.user_anonymization (
    user_id BIGINT REFERENCES website.steam_user(user_id) ON DELETE CASCADE,
    community_id UUID REFERENCES community(community_id) ON DELETE CASCADE,
    anonymized BOOLEAN NOT NULL DEFAULT FALSE,
    hide_location BOOLEAN NOT NULL DEFAULT FALSE,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (user_id, community_id)
);

CREATE INDEX idx_user_anonymization_user ON website.user_anonymization(user_id);
CREATE INDEX idx_user_anonymization_community ON website.user_anonymization(community_id);

CREATE OR REPLACE FUNCTION update_anonymization_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_user_anonymization_timestamp
    BEFORE UPDATE ON website.user_anonymization
    FOR EACH ROW
    EXECUTE FUNCTION update_anonymization_timestamp();

CREATE OR REPLACE FUNCTION website.is_superuser(check_user_id BIGINT)
RETURNS BOOLEAN AS $$
BEGIN
RETURN EXISTS (
    SELECT 1 FROM website.user_roles
    WHERE user_id = check_user_id AND role = 'superuser'
);
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION website.is_map_manager(check_user_id BIGINT)
RETURNS BOOLEAN AS $$
BEGIN
RETURN EXISTS (
    SELECT 1 FROM website.user_roles
    WHERE user_id = check_user_id AND role = 'map_manager'
);
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION website.is_community_admin(check_user_id BIGINT, check_community_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
RETURN EXISTS (
    SELECT 1 FROM website.user_roles
    WHERE user_id = check_user_id
      AND role = 'community_admin'
      AND community_id = check_community_id
);
END;
$$ LANGUAGE plpgsql;


CREATE TYPE data_vote_type_enum AS ENUM ('UpVote', 'DownVote');

-- Create the guides table
CREATE TABLE website.guides (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    map_name TEXT NOT NULL,
    title TEXT NOT NULL,
    content TEXT NOT NULL,
    category TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT current_timestamp,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT current_timestamp,
    upvotes BIGINT NOT NULL DEFAULT 0,
    downvotes BIGINT NOT NULL DEFAULT 0,
    comment_count BIGINT NOT NULL DEFAULT 0,
    slug VARCHAR(120) NOT NULL UNIQUE,
    author_id BIGINT NOT NULL REFERENCES website.steam_user(user_id) ON DELETE CASCADE,
    server_id VARCHAR(100) REFERENCES server(server_id)
);

-- Create the guide_comments table
CREATE TABLE website.guide_comments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    guide_id UUID NOT NULL REFERENCES website.guides(id) ON DELETE CASCADE,
    author_id BIGINT NOT NULL REFERENCES website.steam_user(user_id) ON DELETE CASCADE,
    content TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    upvotes BIGINT NOT NULL DEFAULT 0,
    downvotes BIGINT NOT NULL DEFAULT 0
);

-- Create indexes for common queries
CREATE INDEX idx_guides_map_name ON website.guides(map_name);
CREATE INDEX idx_guides_server_id ON website.guides(server_id);
CREATE INDEX idx_guides_author_id ON website.guides(author_id);
CREATE INDEX idx_guides_category ON website.guides(category);
CREATE INDEX idx_guides_created_at ON website.guides(created_at DESC);

CREATE INDEX idx_guide_comments_guide_id ON website.guide_comments(guide_id);
CREATE INDEX idx_guide_comments_author_id ON website.guide_comments(author_id);
CREATE INDEX idx_guide_comments_created_at ON website.guide_comments(created_at DESC);


CREATE TABLE website.guide_votes (
    guide_id UUID NOT NULL,
    user_id BIGINT NOT NULL REFERENCES website.steam_user(user_id) ON DELETE CASCADE,
    vote_type data_vote_type_enum NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,

    PRIMARY KEY (guide_id, user_id),
    FOREIGN KEY (guide_id) REFERENCES website.guides(id) ON DELETE CASCADE
);

CREATE TABLE website.guide_comment_votes (
    comment_id UUID NOT NULL,
    user_id BIGINT NOT NULL REFERENCES website.steam_user(user_id) ON DELETE CASCADE,
    vote_type data_vote_type_enum NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,

    PRIMARY KEY (comment_id, user_id),
    FOREIGN KEY (comment_id) REFERENCES website.guide_comments(id) ON DELETE CASCADE
);
CREATE TABLE website.report_guide (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    guide_id UUID NOT NULL REFERENCES website.guides(id) ON DELETE CASCADE,
    user_id BIGINT NOT NULL REFERENCES website.steam_user(user_id) ON DELETE CASCADE,
    reason TEXT NOT NULL,
    details TEXT NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'resolved', 'dismissed')),
    resolved_by BIGINT REFERENCES website.steam_user(user_id) ON DELETE SET NULL,
    resolved_at TIMESTAMP WITH TIME ZONE,
    timestamp TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_report_guide_status ON website.report_guide(status);

CREATE TABLE website.report_guide_comment (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    comment_id UUID NOT NULL REFERENCES website.guide_comments(id) ON DELETE CASCADE,
    user_id BIGINT NOT NULL REFERENCES website.steam_user(user_id) ON DELETE CASCADE,
    reason TEXT NOT NULL,
    details TEXT NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'resolved', 'dismissed')),
    resolved_by BIGINT REFERENCES website.steam_user(user_id) ON DELETE SET NULL,
    resolved_at TIMESTAMP WITH TIME ZONE,
    timestamp TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_report_guide_comment_status ON website.report_guide_comment(status);
CREATE INDEX idx_report_guide_comment_comment_id ON website.report_guide_comment(comment_id);

CREATE TABLE website.report_map_music (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    music_id UUID NOT NULL REFERENCES map_music(id) ON DELETE CASCADE,
    user_id BIGINT NOT NULL REFERENCES website.steam_user(user_id) ON DELETE CASCADE,
    reason TEXT NOT NULL CHECK (reason IN ('video_unavailable', 'wrong_video')),
    details TEXT NOT NULL DEFAULT '',
    suggested_youtube_url TEXT,
    current_youtube_music TEXT,
    status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'resolved', 'dismissed')),
    resolved_by BIGINT REFERENCES website.steam_user(user_id) ON DELETE SET NULL,
    resolved_at TIMESTAMP WITH TIME ZONE,
    timestamp TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT unique_pending_music_report UNIQUE (music_id, user_id, status) DEFERRABLE INITIALLY DEFERRED
);
CREATE INDEX idx_report_map_music_status ON website.report_map_music(status);
CREATE INDEX idx_report_map_music_music_id ON website.report_map_music(music_id);
CREATE INDEX idx_report_map_music_user_id ON website.report_map_music(user_id);

CREATE TABLE website.guide_user_ban (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id BIGINT NOT NULL REFERENCES website.steam_user(user_id) ON DELETE CASCADE,
    banned_by BIGINT NOT NULL REFERENCES website.steam_user(user_id),
    reason TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP WITH TIME ZONE,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    UNIQUE(user_id)
);
CREATE INDEX idx_guide_user_ban_active ON website.guide_user_ban(user_id) WHERE is_active = TRUE;

CREATE TYPE notification_preference_type AS ENUM (
    'Announcements',
    'System',
    'Map_Specific'
);

CREATE TABLE website.push_subscriptions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id BIGINT NOT NULL REFERENCES website.steam_user(user_id) ON DELETE CASCADE,
    endpoint TEXT NOT NULL,
    p256dh_key TEXT NOT NULL,
    auth_key TEXT NOT NULL,
    user_agent TEXT,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    last_used_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, endpoint)
);

CREATE INDEX idx_push_subscriptions_user ON website.push_subscriptions(user_id);
CREATE INDEX idx_push_subscriptions_endpoint ON website.push_subscriptions(endpoint);
CREATE INDEX idx_push_subscriptions_last_used ON website.push_subscriptions(last_used_at);

CREATE TABLE website.notification_preferences (
    user_id BIGINT PRIMARY KEY REFERENCES website.steam_user(user_id) ON DELETE CASCADE,
    announcements_enabled BOOLEAN NOT NULL DEFAULT TRUE,
    system_enabled BOOLEAN NOT NULL DEFAULT TRUE,
    map_specific_enabled BOOLEAN NOT NULL DEFAULT FALSE,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_notification_preferences_user ON website.notification_preferences(user_id);

CREATE TABLE website.push_vapid_keys (
    id SERIAL PRIMARY KEY,
    public_key TEXT NOT NULL,
    private_key TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    is_active BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE UNIQUE INDEX idx_push_vapid_active ON website.push_vapid_keys(is_active) WHERE is_active = TRUE;

CREATE TABLE website.push_notification_log (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id BIGINT REFERENCES website.steam_user(user_id) ON DELETE CASCADE,
    subscription_id UUID REFERENCES website.push_subscriptions(id) ON DELETE CASCADE,
    notification_type notification_preference_type NOT NULL,
    title TEXT NOT NULL,
    body TEXT NOT NULL,
    sent_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    success BOOLEAN NOT NULL,
    error_message TEXT,
    http_status INTEGER
);

CREATE INDEX idx_push_log_user ON website.push_notification_log(user_id);
CREATE INDEX idx_push_log_sent_at ON website.push_notification_log(sent_at);
CREATE INDEX idx_push_notification_log_subscription ON website.push_notification_log(subscription_id);

CREATE TABLE website.map_change_subscriptions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id BIGINT NOT NULL REFERENCES website.steam_user(user_id) ON DELETE CASCADE,
    server_id VARCHAR(100) NOT NULL REFERENCES server(server_id) ON DELETE CASCADE,
    subscription_id UUID NOT NULL REFERENCES website.push_subscriptions(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    triggered BOOLEAN NOT NULL DEFAULT FALSE,
    triggered_at TIMESTAMP WITH TIME ZONE,
    UNIQUE(user_id, server_id, subscription_id)
);

CREATE INDEX idx_map_change_subs_active ON website.map_change_subscriptions(server_id, triggered) WHERE triggered = FALSE;
CREATE INDEX idx_map_change_subs_user ON website.map_change_subscriptions(user_id);

CREATE TABLE website.map_notify_subscriptions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id BIGINT NOT NULL REFERENCES website.steam_user(user_id) ON DELETE CASCADE,
    map_name TEXT NOT NULL,
    server_id VARCHAR(100) DEFAULT NULL REFERENCES server(server_id) ON DELETE CASCADE,
    subscription_id UUID NOT NULL REFERENCES website.push_subscriptions(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    triggered BOOLEAN NOT NULL DEFAULT FALSE,
    triggered_at TIMESTAMP WITH TIME ZONE,
    UNIQUE(user_id, map_name, server_id, subscription_id)
);

CREATE INDEX idx_map_notify_map_server ON website.map_notify_subscriptions(map_name, server_id) WHERE triggered = FALSE;
CREATE INDEX idx_map_notify_user ON website.map_notify_subscriptions(user_id);

CREATE OR REPLACE FUNCTION website.update_guide_vote_counts()
    RETURNS TRIGGER AS $$
    DECLARE
    target_guide_id UUID;
    BEGIN
          -- Determine which guide_id to update
          IF (TG_OP = 'DELETE') THEN
              target_guide_id := OLD.guide_id;
    ELSE
              target_guide_id := NEW.guide_id;
    END IF;

      -- Recalculate vote counts from scratch
    UPDATE website.guides
    SET
        upvotes = (
            SELECT COUNT(*)
            FROM website.guide_votes
            WHERE guide_id = target_guide_id AND vote_type = 'UpVote'
        ),
        downvotes = (
            SELECT COUNT(*)
            FROM website.guide_votes
            WHERE guide_id = target_guide_id AND vote_type = 'DownVote'
        )
    WHERE id = target_guide_id;

    IF (TG_OP = 'DELETE') THEN
              RETURN OLD;
    ELSE
              RETURN NEW;
    END IF;
    END;
  $$ LANGUAGE plpgsql;

-- Single trigger for all operations
CREATE TRIGGER trg_guide_votes_update_counts
    AFTER INSERT OR UPDATE OR DELETE ON website.guide_votes
    FOR EACH ROW
    EXECUTE FUNCTION website.update_guide_vote_counts();


  CREATE OR REPLACE FUNCTION website.update_guide_comment_vote_counts()
  RETURNS TRIGGER AS $$
  DECLARE
    target_comment_id UUID;
    BEGIN
          IF (TG_OP = 'DELETE') THEN
              target_comment_id := OLD.comment_id;
    ELSE
              target_comment_id := NEW.comment_id;
    END IF;

    UPDATE website.guide_comments
    SET
        upvotes = (
            SELECT COUNT(*)
            FROM website.guide_comment_votes
            WHERE comment_id = target_comment_id AND vote_type = 'UpVote'
        ),
        downvotes = (
            SELECT COUNT(*)
            FROM website.guide_comment_votes
            WHERE comment_id = target_comment_id AND vote_type = 'DownVote'
        )
    WHERE id = target_comment_id;
    IF (TG_OP = 'DELETE') THEN
        RETURN OLD;
    ELSE
        RETURN NEW;
    END IF;
    END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_guide_comment_votes_update_counts
    AFTER INSERT OR UPDATE OR DELETE ON website.guide_comment_votes
    FOR EACH ROW
    EXECUTE FUNCTION website.update_guide_comment_vote_counts();

CREATE OR REPLACE FUNCTION website.update_guide_comment_count()
      RETURNS TRIGGER AS $$
      DECLARE
        target_guide_id UUID;
        BEGIN
                  -- Determine which guide_id to update
                  IF (TG_OP = 'DELETE') THEN
                      target_guide_id := OLD.guide_id;
        ELSE
                      target_guide_id := NEW.guide_id;
        END IF;

                  -- Recalculate comment count from scratch
        UPDATE website.guides
        SET comment_count = (
            SELECT COUNT(*)
            FROM website.guide_comments
            WHERE guide_id = target_guide_id
        )
        WHERE id = target_guide_id;

        IF (TG_OP = 'DELETE') THEN
                      RETURN OLD;
        ELSE
                      RETURN NEW;
        END IF;
        END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_guide_comments_update_count
    AFTER INSERT OR DELETE ON website.guide_comments
      FOR EACH ROW
      EXECUTE FUNCTION website.update_guide_comment_count();




CREATE TABLE map_metadata(
    name VARCHAR(100) PRIMARY KEY,
    workshop_id BIGINT NOT NULL,
    image_url TEXT,
    creators VARCHAR(100),
    file_bytes BIGINT,
    is_tryhard BOOLEAN,
    is_casual BOOLEAN,
    has_lasers BOOLEAN,
    resolved_workshop_id BIGINT
);

CREATE TABLE map_music (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    music_name TEXT NOT NULL UNIQUE,
    duration DOUBLE PRECISION,
    youtube_music TEXT,
    source TEXT NOT NULL,
    tried_searching BOOLEAN NOT NULL DEFAULT false,
    yt_source BIGINT NOT NULL DEFAULT 0
);

CREATE TABLE associated_map_music (
    id SERIAL PRIMARY KEY,
    map_music_id UUID NOT NULL REFERENCES map_music(id) ON DELETE CASCADE,
    map_name TEXT NOT NULL,
    tags TEXT[] NOT NULL
);

CREATE TABLE server_player_counts (
    server_id VARCHAR(100),
    bucket_time TIMESTAMP WITH TIME ZONE,
    player_count INT,
    PRIMARY KEY (server_id, bucket_time)
);
CREATE INDEX idx_server_bucket_time_desc
    ON server_player_counts (server_id, bucket_time DESC);

CREATE TABLE community_player_counts (
    community_id UUID NOT NULL REFERENCES community(community_id) ON DELETE CASCADE,
    time_type    VARCHAR(10) NOT NULL,          -- '10min' | '1hr' | '1day' (matches CommunityGraphTime Display)
    bucket_time  TIMESTAMP WITH TIME ZONE NOT NULL,
    player_count BIGINT NOT NULL,
    PRIMARY KEY (community_id, time_type, bucket_time)
);
CREATE INDEX idx_community_player_counts_desc
    ON community_player_counts (community_id, time_type, bucket_time DESC);

CREATE TABLE server_map
(
    server_id VARCHAR(100) NOT NULL REFERENCES server(server_id) ON DELETE CASCADE,
    map text NOT NULL,
    first_occurrence timestamp with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
    cleared_at timestamp with time zone,
    is_tryhard boolean,
    is_casual boolean,
    cooldown DOUBLE PRECISION,
    current_cooldown TIMESTAMP WITH TIME ZONE,
    pending_cooldown boolean DEFAULT FALSE,
    no_noms boolean NOT NULL DEFAULT FALSE,
    workshop_id BIGINT,
    resolved_workshop_id BIGINT,
    enabled BOOLEAN NOT NULL DEFAULT TRUE,
    min_players SMALLINT DEFAULT 0,
    max_players SMALLINT,
    removed BOOLEAN NOT NULL DEFAULT FALSE,
    map_left INTEGER,
    map_left_last_update TIMESTAMP WITH TIME ZONE,
    nom_available_from TIME,
    nom_available_until TIME,
    available BOOLEAN DEFAULT TRUE,
    PRIMARY KEY (server_id, map)
);
CREATE TABLE region_time (
    region_id SMALLSERIAL PRIMARY KEY,
    region_name VARCHAR(20) NOT NULL,
    start_time TIME WITH TIME ZONE NOT NULL,
    end_time TIME WITH TIME ZONE NOT NULL
);
CREATE TABLE match_data(
    time_id integer REFERENCES server_map_played(time_id) ON DELETE SET NULL,
    extend_count SMALLINT DEFAULT 0,
    zombie_score SMALLINT NOT NULL,
    human_score SMALLINT NOT NULL,
    occurred_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    server_id VARCHAR(100) REFERENCES server(server_id) ON DELETE CASCADE,
    estimated_time_end TIMESTAMP WITH TIME ZONE,
    server_time_end TIMESTAMP WITH TIME ZONE
);
CREATE TABLE day_night (
    zone VARCHAR(10),
    geometry geometry
);

CREATE OR REPLACE FUNCTION get_server_player_counts(server_id TEXT)
RETURNS TABLE (
    server_id TEXT,
    bucket_time TIMESTAMP,
    player_count INTEGER
) AS $$
WITH vars AS (
    SELECT
        date_trunc('minute', COALESCE((
            SELECT MAX(bucket_time) FROM server_player_counts
            WHERE server_player_counts.server_id = get_server_player_counts.server_id LIMIT 1
        ), (
            SELECT MIN(started_at) FROM player_server_session
            WHERE player_server_session.server_id = get_server_player_counts.server_id LIMIT 1
        ))) AS start_time,
        date_trunc('minute', now()) AS end_time
),
time_buckets AS (
    SELECT generate_series(
        (SELECT start_time FROM vars),
        (SELECT end_time FROM vars),
        '1 minute'::interval
    ) AS bucket_time
),
filtered_sessions AS (
    SELECT *
    FROM player_server_session pss
    WHERE pss.server_id = get_server_player_counts.server_id
      AND pss.started_at <= (SELECT end_time FROM vars)
      AND (pss.ended_at >= (SELECT start_time FROM vars) OR (
          pss.ended_at IS NULL AND (now() - pss.started_at) < INTERVAL '12 hours'
      ))
),
historical_counts AS (
    SELECT
        tb.bucket_time,
        ps.server_id,
        COUNT(DISTINCT ps.player_id) AS player_count
    FROM time_buckets tb
    LEFT JOIN filtered_sessions ps
        ON tb.bucket_time >= ps.started_at
        AND tb.bucket_time <= COALESCE(ps.ended_at - INTERVAL '3 minutes', tb.bucket_time)
    GROUP BY tb.bucket_time, ps.server_id
)
SELECT
    COALESCE(server_id, get_server_player_counts.server_id),
    bucket_time,
    LEAST(player_count, 64)
FROM historical_counts;
$$ LANGUAGE SQL STABLE;

CREATE OR REPLACE FUNCTION get_community_player_counts(p_community_id UUID, p_time_type TEXT, p_width INTERVAL)
RETURNS TABLE (
    community_id UUID,
    time_type TEXT,
    bucket_time TIMESTAMP WITH TIME ZONE,
    player_count BIGINT
) AS $$
WITH vars AS (
    SELECT
        COALESCE((
            SELECT MAX(c.bucket_time) - p_width FROM community_player_counts c
            WHERE c.community_id = p_community_id AND c.time_type = p_time_type
        ), (
            SELECT date_bin(p_width, MIN(pss.started_at), 'epoch'::timestamptz)
            FROM player_server_session pss
            JOIN server s ON s.server_id = pss.server_id
            WHERE s.community_id = p_community_id
        )) AS start_time,
        date_bin(p_width, now(), 'epoch'::timestamptz) - p_width AS end_time
),
buckets AS (
    SELECT gs AS bucket_time, gs + p_width AS bucket_end
    FROM generate_series(
        (SELECT start_time FROM vars),
        (SELECT end_time FROM vars),
        p_width
    ) AS gs
),
community_servers AS (
    SELECT s.server_id FROM server s WHERE s.community_id = p_community_id
)
SELECT
    p_community_id,
    p_time_type,
    b.bucket_time,
    COUNT(DISTINCT pss.player_id)::bigint
FROM buckets b
LEFT JOIN player_server_session pss
    ON pss.server_id IN (SELECT cs.server_id FROM community_servers cs)
   AND tstzrange(pss.started_at, pss.ended_at)
       && tstzrange(b.bucket_time, b.bucket_end)
GROUP BY b.bucket_time
$$ LANGUAGE SQL STABLE;


CREATE OR REPLACE FUNCTION notify_player_activity() RETURNS trigger AS $$
BEGIN
  PERFORM pg_notify('player_activity', row_to_json(NEW)::text);
RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_table_player_activity
    AFTER INSERT ON player_server_activity
    FOR EACH ROW EXECUTE FUNCTION notify_player_activity();

CREATE OR REPLACE FUNCTION notify_map_activity() RETURNS trigger AS $$
BEGIN
  PERFORM pg_notify('map_changed', row_to_json(NEW)::text);
RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_table_map_activity
    AFTER INSERT ON server_map_played
    FOR EACH ROW EXECUTE FUNCTION notify_map_activity();


CREATE OR REPLACE FUNCTION notify_map_update() RETURNS trigger AS $$
BEGIN
  PERFORM pg_notify('map_update', row_to_json(NEW)::text);
RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_table_map_update
    AFTER UPDATE ON server_map_played
    FOR EACH ROW EXECUTE FUNCTION notify_map_update();


CREATE OR REPLACE FUNCTION notify_infraction_new() RETURNS trigger AS $$
BEGIN
  PERFORM pg_notify('infraction_new', row_to_json(NEW)::text);
RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_table_infraction_new
    AFTER INSERT ON server_infractions
    FOR EACH ROW EXECUTE FUNCTION notify_infraction_new();

CREATE OR REPLACE FUNCTION notify_infraction_update() RETURNS trigger AS $$
BEGIN
  PERFORM pg_notify('infraction_update', row_to_json(NEW)::text);
RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_table_infraction_update
    AFTER UPDATE ON server_infractions
    FOR EACH ROW EXECUTE FUNCTION notify_infraction_update();

CREATE VIEW player_server_mapped AS
SELECT
    DISTINCT p.player_id,
    p.player_name,
    p.created_at,
    pss.started_at,
    p.location,
    pss.session_id,
    pss.server_id,
    p.location_code ->> 'country' AS location_country
        FROM player_server_session pss
        JOIN player p ON p.player_id = pss.player_id
        WHERE pss.ended_at IS NULL
        AND CURRENT_TIMESTAMP - pss.started_at < INTERVAL '1 DAY'
        AND p.location IS NOT NULL;

CREATE MATERIALIZED VIEW player_server_timed AS
SELECT
    pss.session_id AS fid,
    p.player_id,
    p.player_name,
    p.created_at,
    pss.started_at,
    pss.ended_at,
    pss.server_id,
    p.location_code ->> 'country'::text AS location_country,
    p.location AS geometry
FROM player_server_session pss
    JOIN player p ON p.player_id::text = pss.player_id::text
WHERE p.location IS NOT NULL;

CREATE SCHEMA external_data;
CREATE TABLE external_data.gfl_csgo_players (
    steamid64 VARCHAR(19) PRIMARY KEY,
    points DOUBLE PRECISION DEFAULT 0,
    human_time BIGINT DEFAULT 0,
    zombie_time BIGINT DEFAULT 0,
    zombie_killed INTEGER DEFAULT 0,
    headshot INTEGER DEFAULT 0,
    infected_time INTEGER DEFAULT 0,
    item_usage INTEGER DEFAULT 0,
    boss_killed INTEGER DEFAULT 0,
    leader_count INTEGER DEFAULT 0,
    td_count INTEGER DEFAULT 0,
    personaname TEXT DEFAULT '',
    avatarURL VARCHAR(255) DEFAULT '',
    timestamp TIMESTAMP DEFAULT NULL
);

CREATE TABLE external_data.nide_players (
    user_id BIGINT PRIMARY KEY,
    steam_id TEXT NOT NULL,
    name TEXT NOT NULL,
    points INTEGER DEFAULT NULL,
    rank INTEGER DEFAULT NULL,
    kills_per_minute DOUBLE PRECISION DEFAULT NULL,
    kills_per_death DOUBLE PRECISION DEFAULT NULL,
    headshots_per_kill DOUBLE PRECISION DEFAULT NULL,
    shots_per_kill DOUBLE PRECISION DEFAULT NULL,
    weapon_accuracy DOUBLE PRECISION DEFAULT NULL,
    headshots INTEGER DEFAULT NULL,
    kills INTEGER DEFAULT NULL,
    deaths INTEGER DEFAULT NULL,
    country VARCHAR(100) DEFAULT NULL,
    country_code VARCHAR(10) DEFAULT NULL,
    longest_kill_streak INTEGER DEFAULT NULL,
    longest_death_streak INTEGER DEFAULT NULL,
    total_connection_time INTEGER DEFAULT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NULL
);

CREATE SCHEMA layers;
-- everything after this part, require PostGIS manual importing through QGIS

CREATE VIEW countries_counted AS
SELECT
    c."NAME" as "name", COUNT(DISTINCT p.player_id) as player_count, c.geom as geometry
FROM layers.countries_fixed AS c
         LEFT JOIN player_server_mapped AS p
          ON c."ISO_A2_EH" = p.location_country OR
             ST_Within(p.location, c.geom)
GROUP BY
    c."NAME", c.geom;


--------------------------------------------------------------------------------------
-- everything after this part require pg_cron, ensure to install them


SELECT cron.schedule_in_database(
    'update-player-counts',
    '*/5 * * * *',  -- Every 5 minutes
    $$
        INSERT INTO server_player_counts (server_id, bucket_time, player_count)
        SELECT s.server_id, g.bucket_time, g.player_count
                       FROM server s
        JOIN LATERAL get_server_player_counts(s.server_id) AS g ON TRUE
        ON CONFLICT (server_id, bucket_time) DO UPDATE
        SET player_count = EXCLUDED.player_count;
    $$,
    'cs2_tracker_db'  -- INSERT YOUR DB NAME
);


SELECT cron.schedule_in_database(
    'cleanup-expired-refresh-tokens',
    '0 0 * * *',                        -- every day at midnight
    $$
        SELECT cleanup_expired_refresh_tokens();
    $$,
    'cs2_tracker_db' -- INSERT YOUR DB NAME
);

SELECT cron.schedule_in_database(
    'update-player-timed',
    '*/10 * * * *',  -- Every 10 minutes
    $$
        REFRESH MATERIALIZED VIEW player_server_timed;
    $$,
  'cs2_tracker_db'  -- INSERT YOUR DB NAME
);



SELECT cron.schedule_in_database(
    'update-player-map-rank',
    '0 0 * * *',
    $$
        REFRESH MATERIALIZED VIEW CONCURRENTLY website.player_map_rank;
    $$,
    'cs2_tracker_db'
);


SELECT cron.schedule_in_database(
    'update-player-play-rank',
    '0 0 * * *',  -- Every day
    $$
        REFRESH MATERIALIZED VIEW CONCURRENTLY website.player_playtime_ranks;
    $$,
    'cs2_tracker_db'  -- INSERT YOUR DB NAME
);

SELECT cron.schedule_in_database(
    'cleanup-triggered-map-subscriptions',
    '0 2 * * *',  -- Run at 2 AM daily
    $$
        DELETE FROM website.map_change_subscriptions
        WHERE triggered = TRUE
          AND triggered_at < NOW() - INTERVAL '7 days';
    $$,
    'cs2_tracker_db'  -- INSERT YOUR DB NAME
);

SELECT cron.schedule_in_database(
    'update-community-counts-10min',
    '*/20 * * * *',  -- Every 20 minutes
    $$
        INSERT INTO community_player_counts (community_id, time_type, bucket_time, player_count)
        SELECT g.community_id, g.time_type, g.bucket_time, g.player_count
        FROM community c
        JOIN LATERAL get_community_player_counts(c.community_id, '10min', INTERVAL '10 minutes') AS g ON TRUE
        ON CONFLICT (community_id, time_type, bucket_time) DO UPDATE
        SET player_count = EXCLUDED.player_count;
    $$,
    'cs2_tracker_db'  -- INSERT YOUR DB NAME
);

SELECT cron.schedule_in_database(
    'update-community-counts-1hr',
    '0 */2 * * *',  -- Every 2 hours
    $$
        INSERT INTO community_player_counts (community_id, time_type, bucket_time, player_count)
        SELECT g.community_id, g.time_type, g.bucket_time, g.player_count
        FROM community c
        JOIN LATERAL get_community_player_counts(c.community_id, '1hr', INTERVAL '1 hour') AS g ON TRUE
        ON CONFLICT (community_id, time_type, bucket_time) DO UPDATE
        SET player_count = EXCLUDED.player_count;
    $$,
    'cs2_tracker_db'  -- INSERT YOUR DB NAME
);

SELECT cron.schedule_in_database(
    'update-community-counts-1day',
    '30 0 * * *',  -- Daily at 00:30 UTC, after the day bucket closes
    $$
        INSERT INTO community_player_counts (community_id, time_type, bucket_time, player_count)
        SELECT g.community_id, g.time_type, g.bucket_time, g.player_count
        FROM community c
        JOIN LATERAL get_community_player_counts(c.community_id, '1day', INTERVAL '1 day') AS g ON TRUE
        ON CONFLICT (community_id, time_type, bucket_time) DO UPDATE
        SET player_count = EXCLUDED.player_count;
    $$,
    'cs2_tracker_db'  -- INSERT YOUR DB NAME
);

-- Server tracking nomination requests submitted by community members
CREATE TABLE website.server_requests (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id BIGINT NOT NULL REFERENCES website.steam_user(user_id) ON DELETE CASCADE,
    community_name TEXT NOT NULL,
    icon_url TEXT,
    servers JSONB NOT NULL,
    game_type TEXT NOT NULL CHECK (game_type IN ('cs2', 'csgo')),
    elaboration TEXT,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
    reviewed_by BIGINT REFERENCES website.steam_user(user_id) ON DELETE SET NULL,
    reviewed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_server_requests_user_id ON website.server_requests(user_id);
CREATE INDEX idx_server_requests_status ON website.server_requests(status);