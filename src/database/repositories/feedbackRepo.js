const supabase = require('../supabaseClient');

async function saveFeedback(data) {
    try {
        const { data: feedback, error } = await supabase
            .from('feedbacks')
            .insert([{
                order_id: data.orderId,
                user_id: data.userId,
                username: data.username,
                rating: data.rating,
                comment: data.comment,
                is_anonymous: data.isAnonymous,
                status: 'pending'
            }])
            .select()
            .single();

        if (error) throw error;
        return feedback;
    } catch (error) {
        console.error('Error saving feedback:', error.message);
        return null;
    }
}

// UPDATE: Jetzt mit Pagination (offset) und Count-Ausgabe für die Seiten!
async function getApprovedFeedbacks(limit = 10, offset = 0) {
    try {
        const { data, count, error } = await supabase
            .from('feedbacks')
            .select('*', { count: 'exact' })
            .eq('status', 'approved')
            .order('created_at', { ascending: false })
            .range(offset, offset + limit - 1);

        if (error) throw error;
        return { data: data || [], count: count || 0 };
    } catch (error) {
        console.error('Error fetching approved feedbacks:', error.message);
        return { data: [], count: 0 };
    }
}

// NEU: Holt alle aktiven Ratings und berechnet den Sterne-Durchschnitt!
async function getFeedbackStats() {
    try {
        const { data, error } = await supabase
            .from('feedbacks')
            .select('rating')
            .eq('status', 'approved');

        if (error) throw error;

        if (!data || data.length === 0) {
            return { average: 0, total: 0 };
        }

        const total = data.length;
        const sum = data.reduce((acc, curr) => acc + curr.rating, 0);
        const average = (sum / total).toFixed(1);

        return { average: parseFloat(average), total };
    } catch (error) {
        console.error('Error fetching feedback stats:', error.message);
        return { average: 0, total: 0 };
    }
}

async function updateFeedbackStatus(feedbackId, status) {
    try {
        const { data, error } = await supabase
            .from('feedbacks')
            .update({ status: status })
            .eq('id', feedbackId)
            .select()
            .single();

        if (error) throw error;
        return data;
    } catch (error) {
        console.error('Error updating feedback status:', error.message);
        return null;
    }
}

async function hasUserAlreadyFeedbacked(orderId) {
    try {
        const { data, error } = await supabase
            .from('feedbacks')
            .select('id')
            .eq('order_id', orderId)
            .maybeSingle();

        if (error) throw error;
        return !!data;
    } catch (error) {
        console.error('Error checking existing feedback:', error.message);
        return false;
    }
}

// ==========================================
// NEU: Lösch-Funktionen für den Master
// ==========================================
async function deleteFeedback(feedbackId) {
    try {
        const { error } = await supabase
            .from('feedbacks')
            .delete()
            .eq('id', feedbackId);

        if (error) throw error;
        return true;
    } catch (error) {
        console.error('Error deleting feedback:', error.message);
        return false;
    }
}

async function deleteAllFeedbacks() {
    try {
        // Löscht alle Einträge (Trick mit ungleicher UUID, damit Supabase den Delete zulässt)
        const { error } = await supabase
            .from('feedbacks')
            .delete()
            .neq('id', '00000000-0000-0000-0000-000000000000');

        if (error) throw error;
        return true;
    } catch (error) {
        console.error('Error deleting all feedbacks:', error.message);
        return false;
    }
}

module.exports = {
    saveFeedback,
    getApprovedFeedbacks,
    getFeedbackStats,
    updateFeedbackStatus,
    hasUserAlreadyFeedbacked,
    deleteFeedback, // NEU EXPORTIERT
    deleteAllFeedbacks // NEU EXPORTIERT
};
