// shared.js — Loaded by both index.html (player) and admin.html (admin)
// Contains: Supabase config, TIME_SLOTS, auth, profile, form builder, data fetcher

const SUPABASE_URL = "https://xuzoznicceskwulsmymq.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inh1em96bmljY2Vza3d1bHNteW1xIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODM4NDE0NzQsImV4cCI6MjA5OTQxNzQ3NH0.5YCJ2EzXNGK23Sml7rAOHzY9JX5PZnUrjihDUlZpr8c";
const _supabase = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Generate time slot options
const TIME_SLOTS = ["23.45 utc - 00.15 utc (start of the day)"];
for (let h = 0; h < 24; h++) {
    let sh = String(h).padStart(2, '0');
    TIME_SLOTS.push(sh + ".15 utc - " + sh + ".45 utc");
    if (h < 23) {
        let nh = String(h + 1).padStart(2, '0');
        TIME_SLOTS.push(sh + ".45 utc - " + nh + ".15 utc");
    }
}
TIME_SLOTS.push("23.45 utc - 00.15 utc (end of the day)");


class AppConfig {
    constructor() {
        this.currentUser = null;
        this.eventsList = [];
        this.allPlayers = [];
        this.isEditingProfile = false;
        this.currentFocusedEvent = null;
        this.currentFocusedUserResponse = null;
    }

    async init() {
        try {
            const savedId = localStorage.getItem('alliance_matrix_player_id');
            if (savedId) {
                document.getElementById('login-id').value = savedId;
                await this.login();
            }
        } catch (err) {
            console.error(err);
        }
    }

    async login() {
        const idInput = document.getElementById('login-id').value.trim();
        if (!idInput) return alert("Please enter your Player ID.");

        let { data: player } = await _supabase
            .from('players').select('*').eq('player_id', parseInt(idInput)).single();
        if (!player) return alert("Player ID not found.");

        this.currentUser = player;
        localStorage.setItem('alliance_matrix_player_id', idInput);

        document.getElementById('login-panel').classList.add('hidden');
        document.getElementById('global-logout-btn').classList.remove('hidden');
        document.getElementById('app-workspace').classList.remove('hidden');

        this.renderProfileSectionValues();

        if (player.access_level === 'admin') {
            let { data: roster } = await _supabase.from('players').select('*');
            this.allPlayers = roster || [];
        }

        await this.loadEvents();
        await this.onLoginSuccess();
    }

    logout() {
        this.currentUser = null;
        this.isEditingProfile = false;
        this.currentFocusedEvent = null;
        this.currentFocusedUserResponse = null;
        localStorage.removeItem('alliance_matrix_player_id');
        document.getElementById('login-id').value = '';
        document.getElementById('app-workspace').classList.add('hidden');
        document.getElementById('global-logout-btn').classList.add('hidden');
        document.getElementById('login-panel').classList.remove('hidden');
        this.onLogoutCleanup();
    }

    async loadEvents() {
        let { data: events, error } = await _supabase
            .from('events').select('*').order('created_at', { ascending: false });
        if (error) { console.error(error); return; }
        this.eventsList = events || [];
        await this.onEventsLoaded();
    }

    // --- Hooks: override these in each page's subclass ---

    async onLoginSuccess() {}
    onLogoutCleanup() {}
    async onEventsLoaded() {}


    // --- Profile (shared by both pages) ---

    renderProfileSectionValues() {
        if (!this.currentUser) return;
        // Guard: skip if profile elements don't exist on this page (e.g. admin.html)
        if (!document.getElementById('display-player-id')) return;
        document.getElementById('display-player-id').innerText = this.currentUser.player_id;

        if (!this.isEditingProfile) {
            document.getElementById('wrapper-player-name').innerHTML =
                '<strong>Player Name:</strong> <span id="display-player-name">' + (this.currentUser.player_name || '--') + '</span>';
            document.getElementById('wrapper-player-alliance').innerHTML =
                '<strong>Alliance:</strong> <span id="display-player-alliance">' + (this.currentUser.current_alliance || '--') + '</span>';
            document.getElementById('profile-city').disabled = true;
            document.getElementById('profile-inf').disabled = true;
            document.getElementById('profile-cav').disabled = true;
            document.getElementById('profile-arch').disabled = true;
            document.getElementById('profile-action-btn').innerText = "Edit Profile";
        } else {
            document.getElementById('wrapper-player-name').innerHTML =
                '<label style="display:inline-block; font-weight:bold; margin-right:5px;">Player Name:</label>' +
                '<input type="text" id="edit-player-name" value="' + (this.currentUser.player_name || '') + '" style="width:200px; padding:4px;">';
            document.getElementById('wrapper-player-alliance').innerHTML =
                '<label style="display:inline-block; font-weight:bold; margin-right:5px;">Alliance:</label>' +
                '<input type="text" id="edit-player-alliance" value="' + (this.currentUser.current_alliance || '') + '" style="width:200px; padding:4px;">';
            document.getElementById('profile-city').disabled = false;
            document.getElementById('profile-inf').disabled = false;
            document.getElementById('profile-cav').disabled = false;
            document.getElementById('profile-arch').disabled = false;
            document.getElementById('profile-action-btn').innerText = "Save Changes";
        }

        document.getElementById('profile-city').value = this.currentUser.city_level || "TG5";
        document.getElementById('profile-inf').value = this.currentUser.infantry_tier || "TG10";
        document.getElementById('profile-cav').value = this.currentUser.cavalry_tier || "TG10";
        document.getElementById('profile-arch').value = this.currentUser.archer_tier || "TG10";
    }

    async toggleProfileEditMode() {
        if (!this.isEditingProfile) {
            this.isEditingProfile = true;
            this.renderProfileSectionValues();
        } else {
            const targetName = document.getElementById('edit-player-name').value.trim();
            const targetAlliance = document.getElementById('edit-player-alliance').value.trim();
            if (!targetName) return alert("Player Name cannot be blank.");

            const updatedFields = {
                player_name: targetName,
                current_alliance: targetAlliance,
                city_level: document.getElementById('profile-city').value,
                infantry_tier: document.getElementById('profile-inf').value,
                cavalry_tier: document.getElementById('profile-cav').value,
                archer_tier: document.getElementById('profile-arch').value
            };

            const { error } = await _supabase.from('players')
                .update(updatedFields).eq('player_id', parseInt(this.currentUser.player_id));
            if (error) return alert("Error saving profile changes: " + error.message);

            this.currentUser = { ...this.currentUser, ...updatedFields };
            this.isEditingProfile = false;
            this.renderProfileSectionValues();
            alert("Profile details updated successfully!");
        }
    }


    // --- Data fetcher (shared by both pages) ---

    // Fetches participations and players separately, then merges in JS.
    // This avoids the need for a foreign key between event_participations and players.
    async fetchParticipationsWithPlayers(eventId) {
        const { data: parts, error: partsErr } = await _supabase
            .from('event_participations').select('*')
            .eq('event_id', eventId)
            .order('updated_at', { ascending: false });
        if (partsErr) throw partsErr;

        const { data: playersData, error: playersErr } = await _supabase
            .from('players').select('*');
        if (playersErr) throw playersErr;

        const playerMap = {};
        (playersData || []).forEach(p => { playerMap[p.player_id] = p; });

        return (parts || []).map(p => {
            if (p.player_responses && typeof p.player_responses === 'string') {
                try { p.player_responses = JSON.parse(p.player_responses); } catch(e) { console.error(e); }
            }
            p.players = playerMap[p.player_id] || null;
            return p;
        });
    }
}
