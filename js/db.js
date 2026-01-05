import { SUPABASE_URL, SUPABASE_KEY } from './supabase-config.js';

export const db = {
    client: null,

    async open() {
        if (!window.supabase) {
            console.error("Supabase SDK not loaded");
            return;
        }
        this.client = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
        console.log("Supabase Client Initialized");
    },

    async addLog(data) {
        if (!this.client) await this.open();

        let imageUrl = null;
        let thumbnailUrl = null;

        // Upload Image
        if (data.image) {
            imageUrl = await this.uploadFile(data.image);
        }
        // Upload Thumbnail
        if (data.thumbnail) {
            thumbnailUrl = await this.uploadFile(data.thumbnail);
        }

        const { data: result, error } = await this.client
            .from('logs')
            .insert({
                name: data.name,
                region: data.region,
                alcohol: data.alcohol,
                rating_overall: data.ratingOverall,
                rating_price: data.ratingPrice,
                rating_taste: data.ratingTaste,
                memo: data.memo,
                date: data.date,
                image_url: imageUrl,
                thumbnail_url: thumbnailUrl
            })
            .select();

        if (error) throw error;
        return result;
    },

    async uploadFile(file) {
        const fileName = `${Date.now()}_${Math.random().toString(36).substring(7)}.jpg`;
        const { data, error } = await this.client.storage
            .from('makgeolli-images')
            .upload(fileName, file);

        if (error) throw error;

        // Get Public URL
        const { data: publicData } = this.client.storage
            .from('makgeolli-images')
            .getPublicUrl(fileName);

        return publicData.publicUrl;
    },

    async deleteLog(id) {
        if (!this.client) await this.open();

        const { error } = await this.client
            .from('logs')
            .delete()
            .eq('id', id);

        if (error) throw error;
    },

    async getAllLogs() {
        if (!this.client) await this.open();

        const { data, error } = await this.client
            .from('logs')
            .select('*')
            .order('date', { ascending: false });

        if (error) throw error;

        // Map Supabase fields to App fields
        return data.map(item => ({
            id: item.id,
            name: item.name,
            region: item.region,
            alcohol: item.alcohol,
            ratingOverall: item.rating_overall,
            ratingPrice: item.rating_price,
            ratingTaste: item.rating_taste,
            memo: item.memo,
            date: item.date,
            image: item.image_url,      // Map URL to 'image'
            thumbnail: item.thumbnail_url // Map URL to 'thumbnail'
        }));
    },

    async getLog(id) {
        if (!this.client) await this.open();

        const { data, error } = await this.client
            .from('logs')
            .select('*')
            .eq('id', id)
            .single();

        if (error) throw error;

        return {
            id: data.id,
            name: data.name,
            region: data.region,
            alcohol: data.alcohol,
            ratingOverall: data.rating_overall,
            ratingPrice: data.rating_price,
            ratingTaste: data.rating_taste,
            memo: data.memo,
            date: data.date,
            image: data.image_url,
            thumbnail: data.thumbnail_url
        };
    }
};
