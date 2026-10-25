const initialized = new WeakSet();
const methods = [
    ['Sketches', 'Make an early design idea visible so others can discuss its form and intent.', 'What can a sketch clarify that a verbal description might leave ambiguous?'],
    ['Technical drawings', 'Communicate geometry, dimensions, and details using shared drawing conventions.', 'Which details would another engineer need to interpret the design consistently?'],
    ['Models', 'Represent spatial relationships in a physical or digital form that can be examined from different viewpoints.', 'What spatial relationship becomes easier to explain with a model?'],
    ['Reports', 'Explain the design rationale, assumptions, calculations, and supporting evidence in writing.', 'Which assumption needs a written explanation rather than just an image?'],
    ['Presentations', 'Combine spoken explanation and visuals for a particular audience and invite questions.', 'How would the explanation change for a technical audience versus a client?'],
];
const reflections = {
    add: 'Check relevance before adding. An extra method strengthens an explanation only when you can describe its purpose and connect it to the design and audience.',
    justify: 'Name the gap in the original explanation, choose a relevant method, and explain why the revision communicates the design more clearly.',
    retain: 'Keeping the original can be reasonable if it already meets the task. Explain why the additional suggestion is unnecessary or unsuitable.',
};
const verifications = {
    accept: 'First establish why the AI productivity rate applies to this work and crew. A different or shorter result is not sufficient evidence to adopt it.',
    retain: 'The worksheet rate is the starting reference. Explain why it applies, then check the calendar and predecessor logic before retaining that duration.',
    verify: 'Compare the source and applicability of each productivity rate, then check crew assumptions, the working calendar, and predecessor logic. Revise only with a defensible reason.',
};
export function calculateDuration(quantity, crew, rate) {
    if (![quantity, crew, rate].every(n => Number.isFinite(n) && n > 0) || !Number.isInteger(crew))
        return null;
    const exact = quantity / (crew * rate);
    const nearest = Math.round(exact);
    const rounded = Math.abs(exact - nearest) <= Number.EPSILON * 8 * Math.max(1, Math.abs(exact)) ? nearest : exact;
    return { exact, days: Math.max(1, Math.ceil(rounded)) };
}
export function setupInstructionalSequences(scope) {
    scope.querySelectorAll('[data-sequence-explorer]').forEach(root => {
        if (initialized.has(root))
            return;
        initialized.add(root);
        const steps = { G1: 0, G2: 0 };
        let course = 'G1';
        const query = (selector) => root.querySelector(selector);
        const all = (selector) => Array.from(root.querySelectorAll(selector));
        const announce = (message) => { query('[data-sequence-announcement]').textContent = message; };
        function select(nextCourse, nextStep, focus = false) {
            if (!['G1', 'G2'].includes(nextCourse))
                return;
            course = nextCourse;
            steps[course] = Math.max(0, Math.min(2, nextStep));
            root.dataset.sequenceTheme = course;
            for (const tab of all('[data-sequence-course]')) {
                const selected = tab.dataset.sequenceCourse === course;
                tab.setAttribute('aria-selected', String(selected));
                tab.tabIndex = selected ? 0 : -1;
            }
            for (const pathway of all('[data-sequence-pathway]')) {
                pathway.hidden = pathway.dataset.sequencePathway !== course;
                const step = steps[pathway.dataset.sequencePathway];
                pathway.querySelectorAll('[data-sequence-step]').forEach(tab => {
                    const selected = Number(tab.dataset.sequenceStep) === step;
                    tab.setAttribute('aria-selected', String(selected));
                    tab.tabIndex = selected ? 0 : -1;
                });
                pathway.querySelectorAll('[data-sequence-panel]').forEach(panel => { panel.hidden = Number(panel.dataset.sequencePanel) !== step; });
                pathway.querySelector('[data-sequence-progress]').textContent = `Step ${step + 1} of 3`;
                pathway.querySelector('[data-sequence-previous]').disabled = step === 0;
                pathway.querySelector('[data-sequence-next]').disabled = step === 2;
            }
            if (focus)
                query(`#sequence-${course}-tab-${steps[course]}`).focus({ preventScroll: true });
            announce(`${course === 'G1' ? 'I2CE' : 'ScheduleAI'}, step ${steps[course] + 1} of 3: ${query(`#sequence-${course}-tab-${steps[course]} strong`).textContent}.`);
        }
        function calculate() {
            const inputs = all('[data-duration-input]');
            const valid = inputs.every(input => input.value.trim() !== '' && input.validity.valid && Number.isFinite(input.valueAsNumber));
            for (const input of inputs)
                input.setAttribute('aria-invalid', String(!(input.value.trim() && input.validity.valid && Number.isFinite(input.valueAsNumber))));
            const status = query('#sequence-calculation-status');
            status.classList.toggle('has-error', !valid);
            all('[data-duration-results]').forEach(result => { result.hidden = !valid; });
            query('[data-duration-difference]').hidden = !valid;
            if (!valid) {
                status.textContent = 'Use 0.01–1,000,000 m² of work, a whole-number crew of 1–10,000, and productivity rates of 0.01–100,000 m² per worker-day. Results are hidden until all inputs are valid.';
                return;
            }
            const values = Object.fromEntries(inputs.map(input => [input.dataset.durationInput, input.valueAsNumber]));
            const number = (value) => value.toLocaleString('en-US', { maximumFractionDigits: 20 });
            const worksheet = calculateDuration(values.quantity, values.crew, values.worksheet);
            const suggestion = calculateDuration(values.quantity, values.crew, values.suggestion);
            for (const [kind, result] of [['worksheet', worksheet], ['suggestion', suggestion]]) {
                all(`[data-duration="${kind}"]`).forEach(el => { el.textContent = number(result.days); });
                all(`[data-exact-duration="${kind}"]`).forEach(el => { el.textContent = result.exact.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); });
                all(`[data-duration-formula="${kind}"]`).forEach(el => { el.textContent = `${number(values.quantity)} ÷ (${number(values.crew)} × ${number(values[kind])})`; });
            }
            const difference = worksheet.days - suggestion.days;
            query('[data-duration-difference]').textContent = difference === 0 ? 'Both assumptions give the same whole-day duration after rounding. The productivity assumptions still need justification.' : `The illustrative suggestion is ${number(Math.abs(difference))} whole working ${Math.abs(difference) === 1 ? 'day' : 'days'} ${difference > 0 ? 'shorter' : 'longer'}. The difference follows from the productivity assumptions.`;
            status.textContent = `${number(values.quantity)} m² · ${number(values.crew)} workers · worksheet ${number(values.worksheet)} vs illustrative AI ${number(values.suggestion)} m² per worker-day. Calculations use unrounded values, then round up to whole days.`;
        }
        root.addEventListener('click', event => {
            const target = event.target.closest('button');
            if (!target || !root.contains(target))
                return;
            if (target.dataset.sequenceCourse)
                select(target.dataset.sequenceCourse, steps[target.dataset.sequenceCourse]);
            else if (target.hasAttribute('data-sequence-step'))
                select(course, Number(target.dataset.sequenceStep));
            else if (target.hasAttribute('data-sequence-next'))
                select(course, steps[course] + 1, true);
            else if (target.hasAttribute('data-sequence-previous'))
                select(course, steps[course] - 1, true);
            else if (target.hasAttribute('data-communication')) {
                const method = methods[Number(target.dataset.communication)];
                if (!method)
                    return;
                all('[data-communication]').forEach(button => button.setAttribute('aria-pressed', String(button === target)));
                for (const [index, selector] of ['[data-communication-title]', '[data-communication-detail]', '[data-communication-question]'].entries())
                    query(selector).textContent = method[index];
            }
            else if (target.dataset.reflection || target.dataset.verification) {
                const type = target.dataset.reflection ? 'reflection' : 'verification';
                all(`[data-${type}]`).forEach(button => button.setAttribute('aria-pressed', String(button === target)));
                query(`[data-${type}-feedback]`).textContent = (type === 'reflection' ? reflections : verifications)[target.dataset[type]];
            }
            else if (target.hasAttribute('data-sequence-reset')) {
                for (const input of all('[data-duration-input]'))
                    input.value = input.defaultValue;
                calculate();
                announce('Formwork teaching example reset.');
            }
        });
        root.addEventListener('input', event => { if (event.target.matches('[data-duration-input]'))
            calculate(); });
        root.addEventListener('keydown', event => {
            const tab = event.target.closest('[role="tab"]');
            if (!tab || !['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key))
                return;
            const tabs = Array.from(tab.closest('[role="tablist"]').querySelectorAll('[role="tab"]'));
            const index = event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : (tabs.indexOf(tab) + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length;
            event.preventDefault();
            tabs[index].click();
            tabs[index].focus({ preventScroll: true });
        });
        calculate();
    });
}
