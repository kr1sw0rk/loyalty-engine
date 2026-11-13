// Loyalty Program Intelligence — Frontend App
// Loads JSON data and renders interactive tables with search/filter

let providersData = [];
let parametersData = [];

// Sector display names
const SECTOR_LABELS = {
    airline: 'Airline',
    hotel: 'Hotel',
    car_rental: 'Car Rental',
    credit_card: 'Credit Card',
    retail: 'Retail',
    dining: 'Dining',
    fuel: 'Fuel',
    entertainment: 'Entertainment',
    other: 'Other'
};

// Region display names
const REGION_LABELS = {
    global: 'Global',
    north_america: 'North America',
    europe: 'Europe',
    asia_pacific: 'Asia Pacific',
    latin_america: 'Latin America',
    middle_eafrica: 'Middle East & Africa',
    middle_efrica: 'Middle East & Africa'
};

// Category display names for parameters
const CATEGORY_LABELS = {
    program_identity: 'Program Identity',
    membership_tiers: 'Membership Tiers',
    earning_structure: 'Earning Structure',
    redemption: 'Redemption',
    point_economics: 'Point Economics',
    scale: 'Scale',
    digital_presence: 'Digital Presence',
    co_branding: 'Co-Branding',
    elite_perks: 'Elite Perks',
    program_economics: 'Program Economics'
};

// Initialize
document.addEventListener('DOMContentLoaded', async () => {
    await loadData();
    renderStats();
    renderProviders();
    renderParameters();
    setupFilters();
    setupTabs();
});

// Load data from JSON files
async function loadData() {
    try {
        const [providersRes, parametersRes] = await Promise.all([
            fetch('data/loyalty_providers.json'),
            fetch('data/loyalty_parameters.json')
        ]);
        providersData = await providersRes.json();
        parametersData = await parametersRes.json();
    } catch (err) {
        console.error('Failed to load data:', err);
    }
}

// Render stats
function renderStats() {
    document.getElementById('total-providers').textContent = providersData.length;
    document.getElementById('total-parameters').textContent = parametersData.length;
    
    const sectors = new Set(providersData.map(p => p.sector));
    document.getElementById('total-sectors').textContent = sectors.size;
}

// Render providers table
function renderProviders() {
    const tbody = document.getElementById('providers-tbody');
    const search = document.getElementById('search-providers').value.toLowerCase();
    const sectorFilter = document.getElementById('filter-sector').value;
    const regionFilter = document.getElementById('filter-region').value;

    const filtered = providersData.filter(p => {
        const matchSearch = !search || 
            p.company_name.toLowerCase().includes(search) ||
            p.program_name.toLowerCase().includes(search);
        const matchSector = !sectorFilter || p.sector === sectorFilter;
        const matchRegion = !regionFilter || p.region === regionFilter;
        return matchSearch && matchSector && matchRegion;
    });

    tbody.innerHTML = filtered.map(p => `
        <tr>
            <td><strong>${escapeHtml(p.company_name)}</strong></td>
            <td>${escapeHtml(p.program_name)}</td>
            <td><span class="badge badge-${p.sector}">${SECTOR_LABELS[p.sector] || p.sector}</span></td>
            <td><span class="badge badge-region">${REGION_LABELS[p.region] || p.region}</span></td>
            <td>${p.estimated_members ? formatMembers(p.estimated_members) : '<span style="color:var(--text-muted)">N/A</span>'}</td>
            <td>${p.program_url ? `<a href="${escapeHtml(p.program_url)}" target="_blank" rel="noopener">↗</a>` : ''}</td>
        </tr>
    `).join('');

    document.getElementById('providers-count').textContent = 
        `${filtered.length} of ${providersData.length} providers`;
}

// Render parameters table
function renderParameters() {
    const tbody = document.getElementById('parameters-tbody');
    const search = document.getElementById('search-parameters').value.toLowerCase();
    const categoryFilter = document.getElementById('filter-category').value;

    const filtered = parametersData.filter(p => {
        const matchSearch = !search ||
            p.id.toLowerCase().includes(search) ||
            p.name.toLowerCase().includes(search) ||
            p.description.toLowerCase().includes(search);
        const matchCategory = !categoryFilter || p.category === categoryFilter;
        return matchSearch && matchCategory;
    });

    tbody.innerHTML = filtered.map(p => `
        <tr>
            <td><code style="color:var(--accent)">${escapeHtml(p.id)}</code></td>
            <td><strong>${escapeHtml(p.name)}</strong></td>
            <td><span class="badge badge-other">${CATEGORY_LABELS[p.category] || p.category}</span></td>
            <td><span style="color:var(--text-muted);font-size:0.8125rem">${escapeHtml(p.data_type)}</span></td>
            <td style="max-width:400px">${escapeHtml(p.description)}</td>
        </tr>
    `).join('');

    document.getElementById('parameters-count').textContent = 
        `${filtered.length} of ${parametersData.length} parameters`;
}

// Setup filters
function setupFilters() {
    // Populate sector filter
    const sectorSelect = document.getElementById('filter-sector');
    const sectors = [...new Set(providersData.map(p => p.sector))].sort();
    sectors.forEach(s => {
        const opt = document.createElement('option');
        opt.value = s;
        opt.textContent = SECTOR_LABELS[s] || s;
        sectorSelect.appendChild(opt);
    });

    // Populate region filter
    const regionSelect = document.getElementById('filter-region');
    const regions = [...new Set(providersData.map(p => p.region))].sort();
    regions.forEach(r => {
        const opt = document.createElement('option');
        opt.value = r;
        opt.textContent = REGION_LABELS[r] || r;
        regionSelect.appendChild(opt);
    });

    // Populate category filter
    const categorySelect = document.getElementById('filter-category');
    const categories = [...new Set(parametersData.map(p => p.category))].sort();
    categories.forEach(c => {
        const opt = document.createElement('option');
        opt.value = c;
        opt.textContent = CATEGORY_LABELS[c] || c;
        categorySelect.appendChild(opt);
    });

    // Event listeners
    document.getElementById('search-providers').addEventListener('input', renderProviders);
    document.getElementById('filter-sector').addEventListener('change', renderProviders);
    document.getElementById('filter-region').addEventListener('change', renderProviders);
    document.getElementById('search-parameters').addEventListener('input', renderParameters);
    document.getElementById('filter-category').addEventListener('change', renderParameters);
}

// Setup tabs
function setupTabs() {
    document.querySelectorAll('.tab').forEach(tab => {
        tab.addEventListener('click', () => {
            document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
            document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
            tab.classList.add('active');
            document.getElementById(`${tab.dataset.tab}-panel`).classList.add('active');
        });
    });
}

// Utility: format member count
function formatMembers(n) {
    if (n >= 1e9) return (n / 1e9).toFixed(1) + 'B';
    if (n >= 1e6) return (n / 1e6).toFixed(1) + 'M';
    if (n >= 1e3) return (n / 1e3).toFixed(1) + 'K';
    return n.toString();
}

// Utility: escape HTML
function escapeHtml(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}
