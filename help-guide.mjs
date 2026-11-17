const growthTimes = [
  ['Sunflower', 3, 4, 6], ['Tulip', 4, 9, 12], ['Rose', 12, 24, 36], ['Daisy', 3, 4, 6],
  ['Lavender', 9, 18, 30], ['Hydrangea', 18, 30, 42], ['Marigold', 3, 4, 6], ['Bluebell', 4, 9, 12],
  ['Peony', 24, 42, 60], ['Poppy', 3, 4, 6], ['Oak Tree', 60, 90, 120], ['Pine Tree', 30, 60, 90],
  ['Cherry Blossom Tree', 18, 30, 42], ['Weeping Willow', 30, 60, 90], ['Apple Tree', 42, 60, 90],
  ['Maple Tree', 60, 90, 120], ['Birch Tree', 12, 24, 42], ['Azalea', 12, 24, 36], ['Boxwood', 30, 60, 90],
  ['Holly Bush', 30, 60, 90], ['Rhododendron', 42, 60, 90], ['Boston Fern', 6, 12, 18], ['Clover', 1, 2, 4],
  ['English Ivy', 4, 9, 18], ['Cactus', 60, 90, 180], ['Palm Tree', 60, 90, 120], ['Monstera', 4, 9, 18],
  ['Fly Agaric Mushroom', 1, 3, 6], ['Chanterelle Mushroom', 1, 2, 4], ['Carrot', 2, 3, 4],
  ['Tomato', 4, 6, 9], ['Pumpkin', 6, 9, 12], ['Lettuce', 1, 3, 4], ['Corn', 4, 6, 9],
  ['Strawberry', 4, 6, 9], ['Watermelon', 6, 9, 12], ['Blueberry Bush', 12, 24, 42],
  ['Raspberry Bush', 12, 24, 36], ['Pineapple', 18, 30, 42],
];

const formatHours = value => `${value} ${value === 1 ? 'hour' : 'hours'}`;
const growthPlantNames = growthTimes.map(([name]) => name).join(' ');
const stageOptions = [
  { id: 'seedling', label: 'Seedling' },
  { id: 'young', label: 'Young' },
  { id: 'growing', label: 'Growing' },
  { id: 'mature', label: 'Mature' },
];
const spriteRevision = '20261117-pine-mature-v2';
const normalizeSearchText = value => String(value).toLocaleLowerCase()
  .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .replace(/[^a-z0-9]+/g, ' ').trim();
const searchableQueryTerms = value => normalizeSearchText(value).split(/\s+/).filter(Boolean);
const singularSearchTerm = term => {
  if (term.length > 4 && term.endsWith('ies')) return `${term.slice(0, -3)}y`;
  if (term.length > 4 && term.endsWith('es')) return term.slice(0, -2);
  if (term.length > 3 && term.endsWith('s')) return term.slice(0, -1);
  return term;
};

const helpCategories = [
  { id: 'all', label: 'All topics' },
  { id: 'start', label: 'Getting started' },
  { id: 'garden', label: 'Garden & controls' },
  { id: 'plants', label: 'Plants & growth' },
  { id: 'landscape', label: 'Paths & ground' },
  { id: 'editing', label: 'Editing & locks' },
  { id: 'sharing', label: 'Sharing & limits' },
];

const helpArticles = [
  {
    id: 'first-steps', category: 'start', title: 'Get started in the garden',
    summary: 'Choose something in the add menu, then place it on the grid.',
    keywords: 'beginning beginner add item place first visit',
    body: `<p>The garden is a shared, bounded <strong>50 × 50</strong> grid. Open the <strong>+</strong> menu, choose an available item, then click or tap an open square to place it.</p><ol><li>Open the item menu.</li><li>Choose a plant, path, ground texture, or available natural feature.</li><li>Click or tap an empty grid square.</li></ol><p>The item menu stays closed after you place an item. Hold <kbd>Shift</kbd> while placing to keep the same item selected and place another. Release Shift to return to one-at-a-time placement.</p><p>The gray, crossed-out catalog items are marked <strong>Coming soon</strong> and cannot be placed yet.</p>`,
  },
  {
    id: 'browse-items', category: 'start', title: 'Browse and preview items',
    summary: 'Find plants, paths, ground textures, and available features.',
    keywords: 'catalog menu flowers trees shrubs mushrooms vegetables fruit rocks decorations coming soon hover preview',
    body: `<p>The add menu contains flowers; trees; bushes and shrubs; ferns and ground cover; tropical and desert plants; mushrooms; vegetables; fruits; paths; ground textures; and rocks or natural features.</p><p>Hover over or focus a catalog tile to see its name. Plant tiles show the mature form first; their preview cycles through the growth stages. Gray, crossed-out tiles are unavailable Coming soon items.</p><p>Available paths include stone, gravel, dirt, cobblestone, and stepping stones. Ground textures include dirt, sand, mulch, pea gravel, river rocks, wood chips, and pine straw. Small rocks, large boulders, and mossy rocks are available natural features.</p>`,
  },
  {
    id: 'board-camera', category: 'garden', title: 'Explore the board',
    summary: 'Move around the finite garden, zoom, and show the placement grid.',
    keywords: 'world board edge boundary 50x50 pan camera zoom grid scroll landscape',
    body: `<p>The playable garden is a fixed <strong>50 × 50</strong> grid. The green area around it is scenery; it is not extra planting space. The camera is bounded so you cannot scroll away forever.</p><ul><li><strong>Drag empty space</strong> to move the view.</li><li><strong>Scroll</strong> to zoom in or out.</li><li>On a touch screen, use <strong>two fingers</strong> to pinch-zoom.</li><li>Tap the grid button to show or hide the placement grid.</li></ul><p>Sprites use crisp pixel-art rendering as you zoom.</p>`,
  },
  {
    id: 'placing-items', category: 'start', title: 'Place and repeat an item',
    summary: 'Use the placement controls, repeat with Shift, or return to the menu.',
    keywords: 'click tap place cursor held hand repeat shift escape right click cancel return mobile toolkit rotate r',
    body: `<p>After choosing an item, move the pointer over the garden to preview where it will land. Choose an open square to place it. A selected plant or object places once by default; hold <kbd>Shift</kbd> as you place to keep it in hand for more placements.</p><ul><li><kbd>Escape</kbd> or <strong>right-click</strong> returns to item choices or cancels a move.</li><li>On mobile, use the on-screen <strong>Return</strong> control.</li><li><kbd>R</kbd> or the on-screen rotate control turns a rotatable item.</li></ul><p>Some objects cover more than one grid square. Their full footprint must fit inside the garden and be unoccupied.</p>`,
  },
  {
    id: 'plant-growth', category: 'plants', title: 'How plant growth works',
    summary: 'Every plant has its own four illustrated stages and real-time growth intervals.',
    keywords: `seedling young growing mature timer countdown stage age growth speed hours days ${growthPlantNames}`,
    body: `<p>Newly placed plants begin as <strong>seedlings</strong> and automatically progress through <strong>young</strong>, <strong>growing</strong>, and <strong>mature</strong>. Each species has its own real-time interval for each transition. Select a plant below to see its four stages and click any stage to preview it. Mature plants stop growing.</p><div class="help-growth-plants" id="helpGrowthPlants"></div><p class="help-note">Each stage card shows how long that plant spends before it advances. These are real-time intervals.</p><p>Some plants already in the garden may be at a later stage.</p>`,
  },
  {
    id: 'draw-paths', category: 'landscape', title: 'Draw or erase paths',
    summary: 'Click-drag to draw a connected path; trace back over it to erase.',
    keywords: 'path stone gravel dirt cobblestone stepping stones draw stroke drag connect erase backwards fence wall',
    body: `<p>Choose a path in the add menu, then <strong>click and drag</strong> across the grid. Neighboring segments connect automatically into lines, corners, and junctions.</p><p>To erase, begin a stroke on an existing path and drag back across the segments you want to remove. Only the matching connected path is erased. If another visitor claims some cells during your stroke, available cells are still placed and conflicting cells are reported.</p><p>Each path cell placed or erased counts as one change.</p>`,
  },
  {
    id: 'ground-textures', category: 'landscape', title: 'Paint ground textures',
    summary: 'Drag a ground material across cells to replace grass and make beds.',
    keywords: 'ground dirt sand mulch pea gravel river rocks wood chips pine straw replace grass painting paint bed flower bed texture remove',
    body: `<p>Choose a ground material and drag across the grid to paint multiple cells. It replaces the grass on those cells. Paint over a cell with a different material to change it; erase a painted cell by drawing back across it with the erase gesture shown by the active placement control.</p><ul><li>Dirt</li><li>Sand</li><li>Mulch</li><li>Pea gravel</li><li>River rocks</li><li>Wood chips</li><li>Pine straw</li></ul><p>Plants and available objects can be placed on top of ground textures. Every cell changed in a stroke uses one change from your hourly allowance.</p>`,
  },
  {
    id: 'select-edit', category: 'editing', title: 'Select, move, rotate, or remove',
    summary: 'Select an existing item to inspect it and use its action buttons.',
    keywords: 'select outline white highlight card information move trash delete bulldoze rotate icon click item existing object',
    body: `<p>Click or tap a placed plant or object to highlight its shape and open its information card. The card shows its name, contributor, placement time, and—when relevant—growth or lock status.</p><ul><li><strong>Move</strong> picks the item up. Choose an empty destination square.</li><li><strong>Trash</strong> removes the selected item.</li><li><strong>Rotate</strong> turns objects that support rotation; it is only shown when available.</li></ul><p>Use <kbd>Escape</kbd> or right-click to cancel a move. On mobile, use the placement control’s Return button.</p>`,
  },
  {
    id: 'item-locks', category: 'editing', title: 'One-hour item protection',
    summary: 'Other visitors cannot change a newly placed or edited item for an hour.',
    keywords: 'locked lockdown lock unlock countdown creator owner placement protection one hour move remove edit',
    body: `<p>After an item is placed, moved, or rotated, it is protected from other visitors for <strong>one real-time hour</strong>. The person who added it can still move, rotate, or remove it during that period.</p><p>Other visitors see the unlock time and countdown on the item card, and the action buttons stay disabled until it unlocks. The lock is renewed when an item is moved or rotated. Your own item card does not show a lock notice.</p><p>Ground cells and path segments have the same contributor protection. Their creator can change them during the lock period.</p>`,
  },
  {
    id: 'hourly-limit', category: 'sharing', title: 'Hourly change allowance',
    summary: 'Each browser identity gets 50 changes per hour, resetting at the hour.',
    keywords: 'limit allowance 50 badge quota reset hour top hourly add move rotate trash delete path cell ground tile',
    body: `<p>Each browser identity can make <strong>50 garden changes per hour</strong>. The allowance resets at the start of each hour. The badge on the profile button shows how many changes remain; hover or focus it for the reset time.</p><p>Each placed, moved, rotated, or removed item counts as one change. Each individual path or ground cell changed counts as one, so a long stroke can use several changes.</p><p>When the allowance runs out, wait for the next hourly reset. The allowance is tied to this browser’s garden identity, so another browser or browser profile has a separate name and allowance.</p>`,
  },
  {
    id: 'profile-history', category: 'sharing', title: 'Your name and contributions',
    summary: 'Set your garden name and see who added an item and when.',
    keywords: 'profile user icon name gardener assigned change edit contributor attribution date timestamp history browser identity',
    body: `<p>The profile button opens your garden name. You start with an assigned name and can change it at any time. Your name is attached to items you add, and selecting an item shows its contributor and placement time when that information is available.</p><p>This prototype uses the current browser’s local garden identity rather than an account login. A different browser or browser profile is treated as a different visitor.</p>`,
  },
  {
    id: 'shared-garden', category: 'sharing', title: 'Working together safely',
    summary: 'The garden updates as visitors contribute; conflicts are reported.',
    keywords: 'collaborate live simultaneous shared visitors conflicting occupied square server resolves other user sync conflict',
    body: `<p>Everyone contributes to the same garden. New placements and edits sync while you work. Before placing, the garden checks the latest shared state.</p><p>If another visitor takes a square at the same time, the garden keeps the cells that are still free and reports the cells that conflicted. Choose another square for a single-item placement that was claimed. Locks prevent other visitors from changing items that are still protected.</p>`,
  },
  {
    id: 'messages-help', category: 'sharing', title: 'When an action cannot be completed',
    summary: 'Understand occupied-cell, lock, allowance, and wait messages.',
    keywords: 'error message occupied full square locked too many requests slow down wait rate limit failed placement',
    body: `<ul><li><strong>Square occupied:</strong> another plant or object is already there. Pick an open square.</li><li><strong>Item locked:</strong> another visitor’s one-hour protection is active. Wait for the countdown to finish.</li><li><strong>Hourly allowance reached:</strong> your badge is at zero. Your allowance returns at the next hour.</li><li><strong>Too many requests:</strong> pause briefly, then try again. This is a short spam-protection wait.</li></ul><p>If a change does not appear, wait for the shared garden to refresh before retrying so you do not duplicate a placement.</p>`,
  },
  {
    id: 'desktop-mobile', category: 'garden', title: 'Desktop and mobile controls',
    summary: 'Use the same garden tools with pointer, keyboard, and touch.',
    keywords: 'mobile phone tablet touch pinch zoom two fingers drag pan cursor right click escape key shortcuts keyboard r shift',
    body: `<p><strong>Desktop:</strong> drag empty space to pan, use the mouse wheel to zoom, click a cell to place, and right-click or press <kbd>Escape</kbd> to return from placement. Press <kbd>R</kbd> to rotate a held rotatable object and hold <kbd>Shift</kbd> to keep placing the same item.</p><p><strong>Mobile:</strong> drag with one finger to pan when no item is held; use two fingers to pinch-zoom. When holding an item, drag it to a cell and release to place. The on-screen placement controls provide Return and rotation where applicable. Drag paths and ground strokes with one finger.</p>`,
  },
];

const categoriesById = new Map(helpCategories.map(category => [category.id, category]));

export function setupHelpGuide({ onOpen = () => {}, plantCatalog = [] } = {}) {
  const toggle = document.querySelector('#helpToggle');
  const dialog = document.querySelector('#helpPanel');
  const search = document.querySelector('#helpSearch');
  const categoryList = document.querySelector('#helpCategories');
  const topicList = document.querySelector('#helpTopics');
  const articlePane = document.querySelector('#helpArticle');
  const resultCount = document.querySelector('#helpResultCount');
  const closeButton = document.querySelector('#closeHelp');
  let activeCategory = 'all';
  let activeArticle = helpArticles[0].id;
const plants = plantCatalog.flatMap(category => (category.plants || []).map(plant => ({
  ...plant,
  categoryId: category.id,
} )));

  function setupPlantGrowthCards(host, query) {
    const hoursByName = new Map(growthTimes.map(([name, ...hours]) => [name, hours]));
    const catalogPlants = plants.map(plant => ({ ...plant, intervals: hoursByName.get(plant.label) }))
      .filter(plant => plant.intervals);
    if (!catalogPlants.length) {
      host.hidden = true;
      return;
    }
    const queryTerms = searchableQueryTerms(query).map(singularSearchTerm);
    const matchesPlant = plant => queryTerms.some(term => normalizeSearchText(plant.label).includes(term));
    const matchingPlant = queryTerms.length > 0 && catalogPlants.some(matchesPlant);
    host.replaceChildren();

    for (const category of plantCatalog) {
      const categoryPlants = catalogPlants.filter(plant => plant.categoryId === category.id)
        .filter(plant => !matchingPlant || matchesPlant(plant));
      if (!categoryPlants.length) continue;
      const group = document.createElement('section');
      group.className = 'help-growth-group';
      const heading = document.createElement('h3');
      heading.textContent = category.label;
      group.append(heading);

      for (const plant of categoryPlants) {
        const card = document.createElement('details');
        card.className = 'help-growth-card';
        const summary = document.createElement('summary');
        summary.className = 'help-growth-summary';
        const name = document.createElement('strong');
        name.textContent = plant.label;
        const prompt = document.createElement('span');
        prompt.textContent = 'View 4 stages';
        summary.append(name, prompt);
        card.append(summary);

        const content = document.createElement('div');
        content.className = 'help-growth-card-content';
        const stageGrid = document.createElement('div');
        stageGrid.className = 'help-growth-stage-grid';
        stageGrid.setAttribute('role', 'group');
        stageGrid.setAttribute('aria-label', `${plant.label} growth stages`);
        const largePreview = document.createElement('img');
        largePreview.className = 'help-growth-stage-large';
        largePreview.alt = '';
        largePreview.draggable = false;
        const previewDescription = document.createElement('p');
        previewDescription.className = 'help-growth-stage-description';

        function selectStage(stageIndex, button) {
          const stage = stageOptions[stageIndex];
          const sprite = `./assets/plants/${plant.id}-${stage.id}.webp?v=${spriteRevision}`;
          largePreview.src = sprite;
          largePreview.alt = `${plant.label}, ${stage.label} stage`;
          previewDescription.textContent = stageIndex < 3
            ? `${stage.label} → ${stageOptions[stageIndex + 1].label}: ${formatHours(plant.intervals[stageIndex])}`
            : `${stage.label} · final stage`;
          stageGrid.querySelectorAll('button').forEach(option => {
            option.setAttribute('aria-pressed', String(option === button));
          });
        }

        stageOptions.forEach((stage, stageIndex) => {
          const button = document.createElement('button');
          button.type = 'button';
          button.className = 'help-growth-stage';
          button.setAttribute('aria-label', `${plant.label}, ${stage.label} stage`);
          button.setAttribute('aria-pressed', 'false');
          const thumbnail = document.createElement('img');
          thumbnail.alt = '';
          thumbnail.draggable = false;
          thumbnail.loading = 'lazy';
          thumbnail.decoding = 'async';
          thumbnail.dataset.sprite = `./assets/plants/${plant.id}-${stage.id}.webp?v=${spriteRevision}`;
          const label = document.createElement('span');
          label.textContent = stage.label;
          const interval = document.createElement('small');
          interval.textContent = stageIndex < 3 ? `${formatHours(plant.intervals[stageIndex])} to next` : 'Final stage';
          button.append(thumbnail, label, interval);
          button.addEventListener('click', () => selectStage(stageIndex, button));
          stageGrid.append(button);
        });
        content.append(stageGrid, largePreview, previewDescription);
        card.append(content);
        card.addEventListener('toggle', () => {
          if (!card.open) return;
          card.querySelectorAll('img[data-sprite]').forEach(image => {
            image.src = image.dataset.sprite;
            image.removeAttribute('data-sprite');
          });
          const firstStage = stageGrid.querySelector('button');
          if (!largePreview.src) firstStage?.click();
        });
        group.append(card);
      }
      host.append(group);
    }
  }

  function render() {
    const query = search.value.trim().toLocaleLowerCase();
    const queryTerms = searchableQueryTerms(query).map(singularSearchTerm);
    const matches = helpArticles.filter(article => {
      if (activeCategory !== 'all' && article.category !== activeCategory) return false;
      const category = categoriesById.get(article.category)?.label || '';
      const searchable = normalizeSearchText(`${article.title} ${article.summary} ${article.keywords} ${category} ${article.body.replace(/<[^>]*>/g, ' ')}`);
      return queryTerms.every(term => searchable.includes(term));
    });
    if (!matches.some(article => article.id === activeArticle)) activeArticle = matches[0]?.id || null;
    resultCount.textContent = `${matches.length} ${matches.length === 1 ? 'guide' : 'guides'}`;
    topicList.replaceChildren();
    for (const article of matches) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'help-topic';
      button.setAttribute('aria-pressed', String(article.id === activeArticle));
      button.innerHTML = `<strong>${article.title}</strong><span>${article.summary}</span>`;
      button.addEventListener('click', () => {
        activeArticle = article.id;
        render();
      });
      topicList.append(button);
    }
    if (!activeArticle) {
      articlePane.innerHTML = `<div class="help-empty"><strong>No guides found</strong><p>Try a different word or choose “All topics”.</p></div>`;
      return;
    }
    const article = helpArticles.find(entry => entry.id === activeArticle);
    const category = categoriesById.get(article.category)?.label || '';
    articlePane.innerHTML = `<div class="help-article-category">${category}</div><h2>${article.title}</h2><p class="help-article-summary">${article.summary}</p><div class="help-article-body">${article.body}</div>`;
    const plantGrowthCards = articlePane.querySelector('#helpGrowthPlants');
    if (plantGrowthCards) setupPlantGrowthCards(plantGrowthCards, query);
    topicList.querySelector(`[aria-pressed="true"]`)?.scrollIntoView({ block: 'nearest' });
  }

  categoryList.replaceChildren();
  for (const category of helpCategories) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'help-category';
    button.textContent = category.label;
    button.setAttribute('aria-pressed', String(category.id === activeCategory));
    button.addEventListener('click', () => {
      activeCategory = category.id;
      categoryList.querySelectorAll('.help-category').forEach(option => {
        option.setAttribute('aria-pressed', String(option === button));
      });
      render();
    });
    categoryList.append(button);
  }

  search.addEventListener('input', render);
  closeButton.addEventListener('click', () => dialog.close());
  toggle.addEventListener('click', () => {
    if (dialog.open) {
      dialog.close();
      return;
    }
    onOpen();
    render();
    dialog.show();
    toggle.setAttribute('aria-expanded', 'true');
    toggle.setAttribute('aria-label', 'Close garden guide and help');
    requestAnimationFrame(() => search.focus());
  });
  dialog.addEventListener('close', () => {
    toggle.setAttribute('aria-expanded', 'false');
    toggle.setAttribute('aria-label', 'Open garden guide and help');
    toggle.focus({ preventScroll: true });
  });
  dialog.addEventListener('cancel', () => {
    toggle.setAttribute('aria-expanded', 'false');
  });
  toggle.setAttribute('aria-expanded', 'false');
  render();

  return {
    close() {
      if (dialog.open) dialog.close();
    },
  };
}
