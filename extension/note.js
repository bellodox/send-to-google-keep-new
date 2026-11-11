// Pure note preparation; no Google credentials, browser storage, or network calls.
export const MAX_TITLE = 1000;
export const MAX_DETAILS = 8000;

export function cleanUrl(value, stripQuery = true) {
    if (typeof value !== 'string' || !value) return '';
    try {
        const url = new URL(value);
        if (!['https:', 'http:'].includes(url.protocol)) return '';
        // Never carry credentials embedded in a source URL into a Keep note.
        url.username = '';
        url.password = '';
        if (stripQuery) {
            // Preserve functional IDs but remove tracking and credentials.
            const host=url.hostname.toLowerCase().replace(/^www\./,'');
            const allowed = host==='youtube.com' || host==='m.youtube.com'
                ? new Set(['v','list','t','start','index'])
                : host==='youtu.be' ? new Set(['t','start'])
                : host==='google.com' || host.endsWith('.google.com')
                    ? new Set(['q','tbm','start'])
                    : new Set();
            for(const name of [...url.searchParams.keys()])
                if(!allowed.has(name.toLowerCase())) url.searchParams.delete(name);
            if (!['developer.mozilla.org','github.com','en.wikipedia.org'].includes(host)) url.hash='';
        }
        return url.toString();
    } catch {
        return '';
    }
}

export function captureToNote(capture, settings = {}) {
    const url = cleanUrl(capture.url, settings.stripQuery !== false);
    const rawTitle = typeof capture.title === 'string' ? capture.title.trim() : '';
    const selection = typeof capture.selection === 'string' ? capture.selection.trim() : '';
    const shortUrl = url ? new URL(url) : null;
    const fallbackTitle = capture.kind === 'link'
        ? `Link — ${shortUrl?.hostname ?? 'web page'}`
        : shortUrl?.hostname || 'New note';
    const title = (rawTitle || fallbackTitle).slice(0, MAX_TITLE);
    const sourceLine=settings.includeUrl !== false && url ? `Source: ${url}` : '';
    // A text selection can already contain an attribution, sometimes attached
    // directly to the preceding sentence ("2012.Source: https://...").
    // Treat equivalent sanitized URLs as the same source even when whitespace
    // or removed tracking parameters differ. Keep one canonical attribution.
    const sameSource = (candidate) => {
        if (!sourceLine || !candidate) return false;
        const trimmed = candidate.replace(/[),;]+$/, '');
        return cleanUrl(trimmed, settings.stripQuery !== false) === url;
    };
    const sourcePattern = /\bSource\s*:\s*(https?:\/\/[^\s<>"']+)/gi;
    let text = selection.replace(sourcePattern, (whole, candidate) => {
        if (!sameSource(candidate)) return whole;
        return '';
    }).trim();
    // If the URL already occurs elsewhere in the selected text, adding a
    // second copy at the bottom would still duplicate it. Retain user text.
    const embeddedSource = (text.match(/https?:\/\/[^\s<>"']+/gi) || [])
        .some(sameSource);
    const attribution = sourceLine && !embeddedSource ? sourceLine : '';
    const separator = text && attribution ? '\n\n' : '';
    const available = Math.max(0, MAX_DETAILS - attribution.length - separator.length);
    text = text.slice(0, available).trimEnd();
    return {
        title,
        details: [text,attribution].filter(Boolean).join('\n\n'),
        referenceDate: '',
    };
}

export function isValidReferenceDate(value) {
    if (value === '') return true;
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const [year, month, day] = value.split('-').map(Number);
    if (year < 1900 || year > 9999) return false;
    const d = new Date(Date.UTC(year, month - 1, day));
    return d.getUTCFullYear() === year && d.getUTCMonth() === month - 1 && d.getUTCDate() === day;
}

export function validateNote(input) {
    if (!input || typeof input !== 'object') throw new Error('Missing note data.');
    if (typeof input.title !== 'string' || typeof input.details !== 'string') {
        throw new Error('Title and details must be text.');
    }
    const title = input.title.trim();
    if (!title || title.length > MAX_TITLE) throw new Error('Provide a title of up to 1,000 characters.');
    if (input.details.length > MAX_DETAILS) throw new Error('Details are too long (8,000 characters maximum).');
    const referenceDate = input.referenceDate ?? '';
    if (!isValidReferenceDate(referenceDate)) throw new Error('Reference date must be a valid date.');
    return { title, details: input.details, referenceDate };
}

export function contentForKeep(input) {
    const note = validateNote(input);
    const pieces = [];
    if (note.details.trim()) pieces.push(note.details.trim());
    if (note.referenceDate) pieces.push(`Reference date (not a reminder): ${note.referenceDate}`);
    // Keep's native editor handles actual reminders separately.
    return { title: note.title, body: pieces.join('\n\n') };
}

export function keepHost(value) {
    try {
        const u = new URL(value);
        return u.protocol === 'https:' && u.hostname === 'keep.google.com';
    } catch { return false; }
}
