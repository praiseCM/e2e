import { research } from './data.js';
import { indicators } from './data.js';
const escape = (s) => s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[c]));
const text = (x, y, s, size = 13, fill = '#101827') => '<text x="' + x + '" y="' + y + '" font-family="Arial,sans-serif" font-size="' + size + '" fill="' + fill + '">' + escape(s) + '</text>';
const frame = (content, w, h) => '<svg xmlns="http://www.w3.org/2000/svg" width="' + w + '" height="' + h + '" viewBox="0 0 ' + w + ' ' + h + '"><title>From Exposure to Experience, aggregate research figure</title><rect width="100%" height="100%" fill="#F7F5EF"/>' + content + '</svg>';
export function distributionSVG(course = 'both', indicator = 'all') {
    const shown = indicators.filter(i => indicator === 'all' || i.id === indicator), courses = ['G1', 'G2'].filter(c => course === 'both' || c === course);
    const colors = ['#253747', '#596c7d', '#9eaeb7', '#d5dcd9', '#b89b68'];
    let svg = text(35, 35, 'Complete-pair PRE / POST response distributions', 22);
    svg += text(35, 60, 'From Exposure to Experience | PRE / POST responses', 12, '#53616d');
    shown.forEach((item, index) => {
        const y = 95 + index * 160;
        svg += text(35, y, item.title + ' (1–' + item.scale + ')', 16);
        courses.forEach((c, col) => {
            const x = 45 + col * 535, w = courses.length === 1 ? 950 : 440;
            const source = research.distributions.filter(d => d.course === c && d.indicator === item.id);
            svg += text(x, y + 24, c + ' · n = ' + source[0].n + ' complete pairs', 12);
            for (const [wave, row] of [['pre', 0], ['post', 1]]) {
                const cy = y + 39 + row * 35;
                svg += text(x, cy + 17, wave.toUpperCase(), 10);
                let offset = x + 42;
                source.filter(d => d.wave === wave).forEach(d => {
                    const bw = w * d.percent / 100, fill = colors[d.category - 1];
                    svg += '<rect x="' + offset + '" y="' + cy + '" width="' + bw + '" height="27" fill="' + fill + '" stroke="#f7f5ef" stroke-width="1"><title>Category ' + d.category + ': ' + d.count + ' / ' + d.n + ' (' + d.percent + '%)</title></rect>';
                    if (d.percent >= 8)
                        svg += text(offset + bw / 2 - 16, cy + 18, d.percent.toFixed(0) + '%', 10, d.category < 3 ? '#fff' : '#101827');
                    offset += bw;
                });
            }
        });
    });
    const y = 100 + shown.length * 160;
    colors.slice(0, Math.max(...shown.map(i => i.scale))).forEach((color, i) => { svg += '<rect x="' + (35 + i * 130) + '" y="' + y + '" width="15" height="15" fill="' + color + '" stroke="#53616d"/>' + text(57 + i * 130, y + 12, 'Category ' + (i + 1), 11); });
    svg += text(35, y + 47, 'Bars sum to 100%. Segment labels are rounded; SVG titles retain exact counts and percentages.', 11, '#53616d');
    svg += text(35, y + 66, 'G1/G2 complete pairs: familiarity 38/58, usefulness 38/59, participation potential 38/58.', 11, '#53616d');
    svg += text(35, y + 85, 'Ordered self-reports; wording equivalence unestablished. Not measured learning or causal effects.', 11, '#53616d');
    return frame(svg, 1120, y + 112);
}
export function estimateSVG() {
    const x = (v) => 235 + (v + .4) / 1.7 * 470;
    let svg = text(35, 35, 'Observed change and baseline-conditioned POST comparisons', 21);
    svg += text(35, 60, 'G1 minus G2 | Estimates and marginal 95% confidence intervals', 12, '#53616d');
    svg += text(35, 86, '● Solid: observed-change difference     ■ Dashed: baseline-conditioned POST', 12);
    svg += '<line x1="' + x(0) + '" x2="' + x(0) + '" y1="105" y2="370" stroke="#73808a" stroke-dasharray="3 4"/>';
    indicators.forEach((item, i) => {
        const base = 135 + i * 85;
        svg += text(35, base + 10, item.short + ' (1–' + item.scale + ')', 13);
        research.estimates.filter(e => e.indicator === item.id).forEach((e, j) => {
            const y = base + j * 30, color = j ? '#806738' : '#101827';
            svg += '<line x1="' + x(e.lower) + '" x2="' + x(e.upper) + '" y1="' + y + '" y2="' + y + '" stroke="' + color + '" stroke-width="2"' + (j ? ' stroke-dasharray="5 4"' : '') + '/>';
            svg += j ? '<rect x="' + (x(e.estimate) - 5) + '" y="' + (y - 5) + '" width="10" height="10" fill="' + color + '"/>' : '<circle cx="' + x(e.estimate) + '" cy="' + y + '" r="5" fill="' + color + '"/>';
            svg += text(745, y + 4, e.estimate.toFixed(3) + ' [' + e.lower.toFixed(3) + ', ' + e.upper.toFixed(3) + ']', 12);
        });
    });
    for (const t of [-.25, 0, .25, .5, .75, 1, 1.25])
        svg += text(x(t) - 10, 395, t.toFixed(2), 10, '#53616d');
    svg += text(235, 420, 'G1 minus G2 · coded response units', 12, '#53616d');
    svg += text(35, 460, 'Observed change: Welch–Satterthwaite intervals.', 11, '#53616d');
    svg += text(35, 480, 'Conditional POST: numeric-PRE model, HC3 standard errors. No section-cluster adjustment.', 11, '#53616d');
    svg += text(35, 500, 'The two analyses answer different questions. Neither estimates an identified causal effect.', 11, '#53616d');
    return frame(svg, 1040, 530);
}
export function downloadFigure(id, name) {
    const el = document.getElementById(id);
    if (id === 'figure-instructional-sequences') {
        const image = el?.querySelector('img');
        if (!image)
            return;
        const link = document.createElement('a');
        link.href = image.src;
        link.download = name + '.svg';
        link.click();
        return;
    }
    const svg = id === 'figure-distributions' ? distributionSVG(el?.dataset.course, el?.dataset.indicator) : estimateSVG();
    const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' })), a = document.createElement('a');
    a.href = url;
    a.download = name + '.svg';
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}
