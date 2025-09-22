// Глобальные переменные для Firebase интеграции
let firebaseApp = null;
let db = null;
let isFirebaseConnected = false;
let isDemoMode = false;
let presentations = [];
let stats = { totalPresentations: 0, totalViews: 0, lastUpdated: null };

// PDF и UI переменные
let currentPDF = null;
let currentPage = 1;
let totalPages = 0;
let zoomScale = 1.0;
let currentPresentationId = null;
let currentFile = null;
let isDarkMode = false;

// Настройка PDF.js
if (typeof pdfjsLib !== 'undefined') {
    pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
}

// Инициализация приложения
document.addEventListener('DOMContentLoaded', function() {
    console.log('Инициализация мини-хостинга презентаций с Firebase...');
    
    // Проверить сохраненную конфигурацию Firebase
    checkFirebaseConfig();
    
    // Инициализация обработчиков событий
    initEventListeners();
    
    console.log('Приложение успешно инициализировано');
});

// === FIREBASE КОНФИГУРАЦИЯ И ПОДКЛЮЧЕНИЕ ===

function checkFirebaseConfig() {
    const savedConfig = localStorage.getItem('firebaseConfig');
    const demoMode = localStorage.getItem('demoMode') === 'true';
    
    if (demoMode) {
        enableDemoMode();
    } else if (savedConfig) {
        try {
            const config = JSON.parse(savedConfig);
            initializeFirebase(config);
        } catch (error) {
            console.error('Ошибка при загрузке сохраненной конфигурации:', error);
            showFirebaseSetup();
        }
    } else {
        showFirebaseSetup();
    }
}

function showFirebaseSetup() {
    document.getElementById('firebaseSetup').classList.remove('hidden');
    document.getElementById('mainApp').classList.add('hidden');
}

function hideFirebaseSetup() {
    document.getElementById('firebaseSetup').classList.add('hidden');
    document.getElementById('mainApp').classList.remove('hidden');
    
    // Инициализация роутинга после показа основного приложения
    initRouter();
    loadPresentations();
    updateStats();
}

function initializeFirebase(config) {
    try {
        console.log('Инициализация Firebase...');
        
        // Инициализация Firebase
        firebaseApp = firebase.initializeApp(config);
        db = firebase.firestore();
        
        // Проверка подключения
        testFirebaseConnection().then(() => {
            isFirebaseConnected = true;
            updateConnectionStatus('Подключено к Firebase', true);
            hideFirebaseSetup();
            showNotification('Firebase успешно подключен!', 'success');
        }).catch((error) => {
            console.error('Ошибка подключения к Firebase:', error);
            showConnectionError('Ошибка подключения: ' + error.message);
        });
        
    } catch (error) {
        console.error('Ошибка инициализации Firebase:', error);
        showConnectionError('Ошибка инициализации: ' + error.message);
    }
}

function testFirebaseConnection() {
    return new Promise((resolve, reject) => {
        if (!db) {
            reject(new Error('База данных не инициализирована'));
            return;
        }
        
        // Попытка прочитать коллекцию stats
        db.collection('stats').limit(1).get()
            .then((snapshot) => {
                console.log('Соединение с Firestore установлено');
                resolve();
            })
            .catch((error) => {
                reject(error);
            });
    });
}

function enableDemoMode() {
    isDemoMode = true;
    isFirebaseConnected = false;
    localStorage.setItem('demoMode', 'true');
    
    // Загрузить демо данные
    loadDemoData();
    updateConnectionStatus('Режим демонстрации (без Firebase)', false);
    hideFirebaseSetup();
    showNotification('Включен режим демонстрации', 'info');
}

function loadDemoData() {
    presentations = [
        {
            id: 'demo-1',
            title: 'Демо презентация 1',
            description: 'Пример презентации в режиме демонстрации',
            fileType: 'pdf',
            fileName: 'demo1.pdf',
            fileSize: 245760,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            views: 15,
            isPublic: true,
            tags: ['демо', 'пример', 'презентация'],
            fileData: null
        },
        {
            id: 'demo-2',
            title: 'Бизнес план презентация',
            description: 'Демонстрация возможностей системы',
            fileType: 'pdf',
            fileName: 'business.pdf',
            fileSize: 384256,
            createdAt: new Date(Date.now() - 86400000).toISOString(),
            updatedAt: new Date(Date.now() - 86400000).toISOString(),
            views: 8,
            isPublic: true,
            tags: ['бизнес', 'план', 'стратегия'],
            fileData: null
        }
    ];
    
    stats = {
        totalPresentations: presentations.length,
        totalViews: presentations.reduce((sum, p) => sum + p.views, 0),
        lastUpdated: new Date().toISOString()
    };
}

function updateConnectionStatus(text, connected) {
    const indicator = document.getElementById('connectionIndicator');
    const connectionText = document.getElementById('connectionText');
    const dot = indicator?.querySelector('.connection-dot');
    
    if (connectionText) connectionText.textContent = text;
    if (dot) {
        dot.classList.toggle('disconnected', !connected);
    }
}

function showConnectionError(message) {
    const status = document.getElementById('connectionStatus');
    status.className = 'connection-status error';
    status.textContent = message;
}

// === FIRESTORE ОПЕРАЦИИ ===

async function savePresentationToFirestore(presentationData) {
    if (!db || isDemoMode) {
        // В демо режиме сохраняем локально
        presentations.push(presentationData);
        updateLocalStats();
        return presentationData.id;
    }
    
    try {
        // Сохраняем презентацию
        await db.collection('presentations').doc(presentationData.id).set(presentationData);
        
        // Обновляем статистику
        await updateFirestoreStats();
        
        console.log('Презентация сохранена в Firestore:', presentationData.id);
        return presentationData.id;
    } catch (error) {
        console.error('Ошибка сохранения в Firestore:', error);
        throw error;
    }
}

async function loadPresentationsFromFirestore() {
    if (!db || isDemoMode) {
        return presentations;
    }
    
    try {
        const snapshot = await db.collection('presentations').orderBy('createdAt', 'desc').get();
        const firestorePresentations = [];
        
        snapshot.forEach(doc => {
            firestorePresentations.push({
                id: doc.id,
                ...doc.data()
            });
        });
        
        console.log(`Загружено ${firestorePresentations.length} презентаций из Firestore`);
        return firestorePresentations;
    } catch (error) {
        console.error('Ошибка загрузки из Firestore:', error);
        throw error;
    }
}

async function incrementViewCount(presentationId) {
    if (!db || isDemoMode) {
        // В демо режиме обновляем локально
        const presentation = presentations.find(p => p.id === presentationId);
        if (presentation) {
            presentation.views++;
            updateLocalStats();
        }
        return;
    }
    
    try {
        const docRef = db.collection('presentations').doc(presentationId);
        await db.runTransaction(async (transaction) => {
            const doc = await transaction.get(docRef);
            if (doc.exists) {
                const newViews = (doc.data().views || 0) + 1;
                transaction.update(docRef, { views: newViews });
            }
        });
        
        await updateFirestoreStats();
        console.log('Счетчик просмотров увеличен:', presentationId);
    } catch (error) {
        console.error('Ошибка обновления просмотров:', error);
    }
}

async function deletePresentationFromFirestore(presentationId) {
    if (!db || isDemoMode) {
        presentations = presentations.filter(p => p.id !== presentationId);
        updateLocalStats();
        return;
    }
    
    try {
        await db.collection('presentations').doc(presentationId).delete();
        await updateFirestoreStats();
        console.log('Презентация удалена из Firestore:', presentationId);
    } catch (error) {
        console.error('Ошибка удаления из Firestore:', error);
        throw error;
    }
}

async function updateFirestoreStats() {
    if (!db || isDemoMode) {
        updateLocalStats();
        return;
    }
    
    try {
        const snapshot = await db.collection('presentations').get();
        let totalViews = 0;
        
        snapshot.forEach(doc => {
            totalViews += doc.data().views || 0;
        });
        
        const statsData = {
            totalPresentations: snapshot.size,
            totalViews: totalViews,
            lastUpdated: firebase.firestore.FieldValue.serverTimestamp()
        };
        
        await db.collection('stats').doc('global').set(statsData, { merge: true });
        
        // Обновляем локальные статистики
        stats.totalPresentations = snapshot.size;
        stats.totalViews = totalViews;
        stats.lastUpdated = new Date().toISOString();
        
    } catch (error) {
        console.error('Ошибка обновления статистики:', error);
    }
}

function updateLocalStats() {
    stats.totalPresentations = presentations.length;
    stats.totalViews = presentations.reduce((sum, p) => sum + p.views, 0);
    stats.lastUpdated = new Date().toISOString();
}

// === ИНИЦИАЛИЗАЦИЯ ОБРАБОТЧИКОВ СОБЫТИЙ ===

function initEventListeners() {
    // Firebase setup
    const connectBtn = document.getElementById('connectFirebaseBtn');
    const demoBtn = document.getElementById('demoModeBtn');
    
    connectBtn?.addEventListener('click', handleFirebaseConnect);
    demoBtn?.addEventListener('click', () => enableDemoMode());
    
    // Навигация (инициализируется позже)
    initNavigationEvents();
    
    // Загрузка файлов
    initFileUpload();
    
    // PDF просмотрщик
    initPDFViewer();
    
    // Модальные окна
    initModals();
    
    // Поиск и сортировка
    initSearch();
    
    // Переключатель темы
    initThemeToggle();
    
    // Настройки
    initSettings();
}

function initNavigationEvents() {
    document.querySelectorAll('.nav-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const route = btn.getAttribute('data-route');
            navigateTo(route);
        });
    });
}

function handleFirebaseConnect() {
    const configInput = document.getElementById('firebaseConfigInput');
    const configText = configInput.value.trim();
    
    if (!configText) {
        showConnectionError('Введите конфигурацию Firebase');
        return;
    }
    
    try {
        const config = JSON.parse(configText);
        
        // Проверка обязательных полей
        const requiredFields = ['apiKey', 'authDomain', 'projectId'];
        for (const field of requiredFields) {
            if (!config[field]) {
                throw new Error(`Отсутствует обязательное поле: ${field}`);
            }
        }
        
        // Показать индикатор загрузки
        const status = document.getElementById('connectionStatus');
        status.className = 'connection-status loading';
        status.textContent = 'Подключение к Firebase...';
        
        // Сохранить конфигурацию и подключиться
        localStorage.setItem('firebaseConfig', configText);
        localStorage.removeItem('demoMode');
        
        initializeFirebase(config);
        
    } catch (error) {
        showConnectionError('Ошибка в конфигурации: ' + error.message);
    }
}

// === РОУТИНГ ===

function initRouter() {
    window.addEventListener('hashchange', handleRouteChange);
    handleRouteChange(); // Обработка начального роута
}

function handleRouteChange() {
    const hash = window.location.hash || '#/';
    const [route, id] = hash.split('/').slice(1);
    
    // Скрыть все страницы
    document.querySelectorAll('.page').forEach(page => page.classList.remove('active'));
    
    // Обновить навигацию
    document.querySelectorAll('.nav-btn').forEach(btn => btn.classList.remove('active'));
    
    switch(route) {
        case '':
        case 'catalog':
            showPage('catalogPage');
            activateNavButton('/');
            updateCatalog();
            break;
        case 'upload':
            showPage('uploadPage');
            activateNavButton('/upload');
            break;
        case 'presentation':
            if (id) {
                showPresentation(id);
            } else {
                navigateTo('/');
            }
            break;
        case 'stats':
            showPage('statsPage');
            activateNavButton('/stats');
            updateStatsPage();
            break;
        case 'settings':
            showPage('settingsPage');
            activateNavButton('/settings');
            updateSettingsPage();
            break;
        default:
            navigateTo('/');
    }
}

function navigateTo(route) {
    window.location.hash = '#' + route;
}

function showPage(pageId) {
    const page = document.getElementById(pageId);
    if (page) {
        page.classList.add('active');
    }
}

function activateNavButton(route) {
    const btn = document.querySelector(`[data-route="${route}"]`);
    if (btn) {
        btn.classList.add('active');
    }
}

// === ЗАГРУЗКА И УПРАВЛЕНИЕ ПРЕЗЕНТАЦИЯМИ ===

async function loadPresentations() {
    const loading = document.getElementById('catalogLoading');
    if (loading) loading.style.display = 'block';
    
    try {
        if (isDemoMode) {
            // В демо режиме данные уже загружены
            presentations = presentations || [];
        } else {
            presentations = await loadPresentationsFromFirestore();
        }
        
        updateCatalog();
        console.log(`Загружено ${presentations.length} презентаций`);
    } catch (error) {
        console.error('Ошибка загрузки презентаций:', error);
        showNotification('Ошибка загрузки презентаций: ' + error.message, 'error');
    } finally {
        if (loading) loading.style.display = 'none';
    }
}

function initFileUpload() {
    const uploadArea = document.getElementById('uploadArea');
    const fileInput = document.getElementById('fileInput');
    const fileSelectBtn = document.getElementById('fileSelectBtn');
    const cancelUploadBtn = document.getElementById('cancelUploadBtn');
    const saveUploadBtn = document.getElementById('saveUploadBtn');
    
    // Кнопка выбора файла
    fileSelectBtn?.addEventListener('click', () => fileInput?.click());
    
    // Обработка выбора файла
    fileInput?.addEventListener('change', (e) => {
        if (e.target.files?.[0]) {
            handleFileSelect(e.target.files[0]);
        }
    });
    
    // Drag and drop
    uploadArea?.addEventListener('dragover', (e) => {
        e.preventDefault();
        uploadArea.classList.add('drag-over');
    });
    
    uploadArea?.addEventListener('dragleave', (e) => {
        e.preventDefault();
        uploadArea.classList.remove('drag-over');
    });
    
    uploadArea?.addEventListener('drop', (e) => {
        e.preventDefault();
        uploadArea.classList.remove('drag-over');
        if (e.dataTransfer.files?.[0]) {
            handleFileSelect(e.dataTransfer.files[0]);
        }
    });
    
    // Отмена загрузки
    cancelUploadBtn?.addEventListener('click', resetUploadForm);
    
    // Сохранение презентации
    saveUploadBtn?.addEventListener('click', savePresentation);
}

function handleFileSelect(file) {
    console.log('Выбран файл:', file.name);
    currentFile = file;
    
    // Проверка типа файла
    const fileExtension = getFileExtension(file.name).toLowerCase();
    const supportedExtensions = ['pdf', 'pptx', 'ppt'];
    
    if (!supportedExtensions.includes(fileExtension)) {
        showNotification(`Неподдерживаемый формат: ${fileExtension.toUpperCase()}`, 'error');
        return;
    }
    
    // Проверка размера файла (500KB лимит для Firestore)
    const maxSize = 500 * 1024; // 500KB
    if (file.size > maxSize) {
        showNotification(`Файл слишком большой: ${formatFileSize(file.size)}. Максимальный размер: 500 КБ`, 'error');
        return;
    }
    
    // Показать форму загрузки
    showUploadForm(file);
}

function showUploadForm(file) {
    const uploadForm = document.getElementById('uploadForm');
    const filePreview = document.getElementById('filePreview');
    const titleInput = document.getElementById('presentationTitle');
    
    // Заполнить превью файла
    filePreview.innerHTML = `
        <div class="file-preview-icon">${getFileIcon(file.name)}</div>
        <div class="file-preview-info">
            <div class="file-preview-name">${file.name}</div>
            <div class="file-preview-meta">${formatFileSize(file.size)} • ${getFileExtension(file.name).toUpperCase()}</div>
        </div>
    `;
    
    // Автозаполнить название
    titleInput.value = file.name.replace(/\.[^/.]+$/, '');
    
    uploadForm.classList.remove('hidden');
    titleInput.focus();
}

function resetUploadForm() {
    const uploadForm = document.getElementById('uploadForm');
    const titleInput = document.getElementById('presentationTitle');
    const descInput = document.getElementById('presentationDescription');
    const tagsInput = document.getElementById('presentationTags');
    const fileInput = document.getElementById('fileInput');
    const uploadProgress = document.getElementById('uploadProgress');
    
    uploadForm.classList.add('hidden');
    uploadProgress.classList.add('hidden');
    titleInput.value = '';
    descInput.value = '';
    tagsInput.value = '';
    fileInput.value = '';
    currentFile = null;
}

async function savePresentation() {
    if (!currentFile) return;
    
    const title = document.getElementById('presentationTitle').value.trim();
    const description = document.getElementById('presentationDescription').value.trim();
    const tagsText = document.getElementById('presentationTags').value.trim();
    const isPublic = document.getElementById('isPublicCheckbox').checked;
    
    if (!title) {
        showNotification('Введите название презентации', 'error');
        return;
    }
    
    // Показать прогресс загрузки
    const progress = document.getElementById('uploadProgress');
    const progressFill = document.getElementById('progressFill');
    const progressText = document.getElementById('progressText');
    const saveBtn = document.getElementById('saveUploadBtn');
    
    progress.classList.remove('hidden');
    saveBtn.disabled = true;
    
    try {
        // Обновить прогресс
        progressFill.style.width = '25%';
        progressText.textContent = 'Чтение файла...';
        
        // Конвертировать файл в base64
        const fileData = await fileToBase64(currentFile);
        
        progressFill.style.width = '50%';
        progressText.textContent = 'Подготовка данных...';
        
        // Создать объект презентации
        const presentation = {
            id: generateId(),
            title: title,
            description: description,
            fileName: currentFile.name,
            fileType: getFileExtension(currentFile.name).toLowerCase(),
            fileSize: currentFile.size,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            views: 0,
            isPublic: isPublic,
            tags: tagsText ? tagsText.split(',').map(tag => tag.trim()) : [],
            fileData: fileData
        };
        
        progressFill.style.width = '75%';
        progressText.textContent = 'Сохранение в базу данных...';
        
        // Сохранить в Firestore
        await savePresentationToFirestore(presentation);
        
        progressFill.style.width = '100%';
        progressText.textContent = 'Завершено!';
        
        setTimeout(() => {
            showNotification('Презентация успешно сохранена!', 'success');
            resetUploadForm();
            updateCatalog();
            updateStats();
            
            // Перейти к каталогу
            navigateTo('/');
        }, 1000);
        
    } catch (error) {
        console.error('Ошибка сохранения презентации:', error);
        showNotification('Ошибка сохранения: ' + error.message, 'error');
        progress.classList.add('hidden');
        saveBtn.disabled = false;
    }
}

function fileToBase64(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = () => resolve(reader.result);
        reader.onerror = error => reject(error);
    });
}

async function deletePresentation(id) {
    if (confirm('Вы уверены, что хотите удалить эту презентацию?')) {
        try {
            await deletePresentationFromFirestore(id);
            presentations = presentations.filter(p => p.id !== id);
            updateCatalog();
            updateStats();
            showNotification('Презентация удалена', 'info');
            
            // Если мы находимся на странице удаленной презентации
            if (currentPresentationId === id) {
                navigateTo('/');
            }
        } catch (error) {
            console.error('Ошибка удаления презентации:', error);
            showNotification('Ошибка удаления: ' + error.message, 'error');
        }
    }
}

// === КАТАЛОГ ПРЕЗЕНТАЦИЙ ===

function updateCatalog() {
    const grid = document.getElementById('presentationsGrid');
    const emptyState = document.getElementById('emptyState');
    const searchTerm = document.getElementById('searchInput')?.value.toLowerCase() || '';
    const sortBy = document.getElementById('sortSelect')?.value || 'date';
    
    let filteredPresentations = presentations.filter(p => 
        p.title.toLowerCase().includes(searchTerm) ||
        (p.description && p.description.toLowerCase().includes(searchTerm)) ||
        (p.tags && p.tags.some(tag => tag.toLowerCase().includes(searchTerm)))
    );
    
    // Сортировка
    filteredPresentations.sort((a, b) => {
        switch(sortBy) {
            case 'name':
                return a.title.localeCompare(b.title);
            case 'size':
                return b.fileSize - a.fileSize;
            case 'views':
                return b.views - a.views;
            default: // date
                return new Date(b.createdAt) - new Date(a.createdAt);
        }
    });
    
    if (filteredPresentations.length === 0) {
        grid.style.display = 'none';
        emptyState.style.display = 'block';
    } else {
        grid.style.display = 'grid';
        emptyState.style.display = 'none';
        grid.innerHTML = filteredPresentations.map(createPresentationCard).join('');
    }
}

function createPresentationCard(presentation) {
    const tags = presentation.tags && presentation.tags.length > 0 
        ? presentation.tags.map(tag => `<span class="tag">${tag}</span>`).join('')
        : '';
    
    return `
        <div class="presentation-card">
            <div class="presentation-preview">
                <div class="preview-icon">${getFileIcon(presentation.fileName)}</div>
                <div class="file-type-badge">${presentation.fileType.toUpperCase()}</div>
            </div>
            <div class="presentation-info">
                <div class="presentation-title">${presentation.title}</div>
                <div class="presentation-meta">
                    ${formatDate(presentation.createdAt)} • ${formatFileSize(presentation.fileSize)} • ${presentation.views} просмотров
                </div>
                ${tags ? `<div class="presentation-tags">${tags}</div>` : ''}
                <div class="presentation-actions">
                    <button class="btn btn--primary btn--sm" onclick="openPresentation('${presentation.id}')">
                        👁️ Открыть
                    </button>
                    <button class="btn btn--outline btn--sm" onclick="sharePresentation('${presentation.id}')">
                        🔗 Поделиться
                    </button>
                    <button class="btn btn--outline btn--sm" onclick="deletePresentation('${presentation.id}')">
                        🗑️ Удалить
                    </button>
                </div>
            </div>
        </div>
    `;
}

// === ПРОСМОТР ПРЕЗЕНТАЦИИ ===

function openPresentation(id) {
    navigateTo(`/presentation/${id}`);
}

async function showPresentation(id) {
    const presentation = presentations.find(p => p.id === id);
    if (!presentation) {
        showNotification('Презентация не найдена', 'error');
        navigateTo('/');
        return;
    }
    
    currentPresentationId = id;
    
    // Увеличить счетчик просмотров
    await incrementViewCount(id);
    
    // Обновить локальные данные
    presentation.views++;
    
    // Заполнить информацию о презентации
    document.getElementById('presentationTitle2').textContent = presentation.title;
    document.getElementById('presentationMeta').textContent = 
        `${formatDate(presentation.createdAt)} • ${formatFileSize(presentation.fileSize)} • ${presentation.views} просмотров`;
    
    // Теги
    const tagsContainer = document.getElementById('presentationTags2');
    if (presentation.tags && presentation.tags.length > 0) {
        tagsContainer.innerHTML = presentation.tags.map(tag => `<span class="tag">${tag}</span>`).join('');
    } else {
        tagsContainer.innerHTML = '';
    }
    
    // Показать страницу презентации
    showPage('presentationPage');
    
    // Загрузить презентацию
    if (presentation.fileType === 'pdf') {
        if (presentation.fileData) {
            loadPresentationPDF(presentation);
        } else {
            showDemoViewer(presentation);
        }
    } else {
        showPPTXViewer();
    }
}

function showDemoViewer(presentation) {
    const pdfViewer = document.getElementById('pdfViewer');
    const pptxViewer = document.getElementById('pptxViewer');
    
    pdfViewer.style.display = 'block';
    pptxViewer.classList.add('hidden');
    
    const canvasContainer = document.querySelector('.pdf-canvas-container');
    canvasContainer.innerHTML = `
        <div style="padding: 60px; text-align: center; background: white; border-radius: 8px; border: 1px solid #ddd;">
            <h3 style="color: #666; margin-bottom: 20px;">📄 ${presentation.title}</h3>
            <p style="color: #999; margin: 10px 0;">Это демонстрационная презентация</p>
            <p style="color: #999; margin: 10px 0;">В режиме демонстрации файлы не сохраняются</p>
            <div style="margin-top: 30px;">
                <button class="btn btn--primary" onclick="navigateTo('/upload')">⬆️ Загрузить реальную презентацию</button>
            </div>
        </div>
    `;
    
    // Настройка элементов управления для демо
    currentPDF = { numPages: 1 };
    currentPage = 1;
    totalPages = 1;
    zoomScale = 1.0;
    updatePageControls();
    updateZoomControls();
}

function loadPresentationPDF(presentation) {
    if (!presentation.fileData || typeof pdfjsLib === 'undefined') {
        showNotification('Ошибка загрузки PDF', 'error');
        return;
    }
    
    const pdfViewer = document.getElementById('pdfViewer');
    const pptxViewer = document.getElementById('pptxViewer');
    
    pdfViewer.style.display = 'block';
    pptxViewer.classList.add('hidden');
    
    const canvasContainer = document.querySelector('.pdf-canvas-container');
    canvasContainer.innerHTML = '<div class="loading">Загрузка PDF...</div>';
    
    // Конвертировать base64 в Uint8Array
    const base64Data = presentation.fileData.split(',')[1];
    const binaryString = atob(base64Data);
    const len = binaryString.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
        bytes[i] = binaryString.charCodeAt(i);
    }
    
    pdfjsLib.getDocument(bytes).promise.then(function(pdf) {
        currentPDF = pdf;
        totalPages = pdf.numPages;
        currentPage = 1;
        zoomScale = 1.0;
        
        canvasContainer.innerHTML = '<canvas id="pdfCanvas"></canvas>';
        updatePageControls();
        updateZoomControls();
        renderPage(currentPage);
    }).catch(function(error) {
        console.error('Ошибка загрузки PDF:', error);
        canvasContainer.innerHTML = '<div style="padding: 40px; text-align: center; color: #999;">Ошибка при загрузке PDF файла</div>';
    });
}

function showPPTXViewer() {
    const pdfViewer = document.getElementById('pdfViewer');
    const pptxViewer = document.getElementById('pptxViewer');
    
    pdfViewer.style.display = 'none';
    pptxViewer.classList.remove('hidden');
}

// === PDF ФУНКЦИИ ===

function initPDFViewer() {
    const prevPageBtn = document.getElementById('prevPageBtn');
    const nextPageBtn = document.getElementById('nextPageBtn');
    const pageInput = document.getElementById('pageInput');
    const zoomInBtn = document.getElementById('zoomInBtn');
    const zoomOutBtn = document.getElementById('zoomOutBtn');
    const fullscreenBtn = document.getElementById('fullscreenBtn');
    
    prevPageBtn?.addEventListener('click', goToPreviousPage);
    nextPageBtn?.addEventListener('click', goToNextPage);
    pageInput?.addEventListener('change', goToSpecificPage);
    zoomInBtn?.addEventListener('click', zoomIn);
    zoomOutBtn?.addEventListener('click', zoomOut);
    fullscreenBtn?.addEventListener('click', toggleFullscreen);
    
    // Клавиатурные сочетания
    document.addEventListener('keydown', (e) => {
        if (currentPDF && document.getElementById('presentationPage')?.classList.contains('active')) {
            if (e.key === 'ArrowLeft' || e.key === 'PageUp') {
                e.preventDefault();
                goToPreviousPage();
            } else if (e.key === 'ArrowRight' || e.key === 'PageDown') {
                e.preventDefault();
                goToNextPage();
            }
        }
    });
}

function renderPage(pageNumber) {
    if (!currentPDF) return;
    
    const pdfCanvas = document.getElementById('pdfCanvas');
    if (!pdfCanvas) return;
    
    currentPDF.getPage(pageNumber).then(function(page) {
        const context = pdfCanvas.getContext('2d');
        const viewport = page.getViewport({ scale: 1.0 });
        const containerWidth = document.querySelector('.pdf-canvas-container')?.clientWidth - 48 || 800;
        const baseScale = Math.min(containerWidth / viewport.width, 1.2);
        const scale = baseScale * zoomScale;
        const scaledViewport = page.getViewport({ scale: scale });
        
        pdfCanvas.height = scaledViewport.height;
        pdfCanvas.width = scaledViewport.width;
        
        const renderContext = {
            canvasContext: context,
            viewport: scaledViewport
        };
        
        page.render(renderContext);
    });
}

function goToPreviousPage() {
    if (currentPage > 1) {
        currentPage--;
        renderPage(currentPage);
        updatePageControls();
    }
}

function goToNextPage() {
    if (currentPage < totalPages) {
        currentPage++;
        renderPage(currentPage);
        updatePageControls();
    }
}

function goToSpecificPage() {
    const pageInput = document.getElementById('pageInput');
    const pageNumber = parseInt(pageInput.value);
    if (pageNumber >= 1 && pageNumber <= totalPages) {
        currentPage = pageNumber;
        renderPage(currentPage);
        updatePageControls();
    } else {
        pageInput.value = currentPage;
    }
}

function zoomIn() {
    if (zoomScale < 3.0) {
        zoomScale += 0.25;
        renderPage(currentPage);
        updateZoomControls();
    }
}

function zoomOut() {
    if (zoomScale > 0.5) {
        zoomScale -= 0.25;
        renderPage(currentPage);
        updateZoomControls();
    }
}

function toggleFullscreen() {
    const canvas = document.getElementById('pdfCanvas');
    if (canvas) {
        if (document.fullscreenElement) {
            document.exitFullscreen();
        } else {
            canvas.requestFullscreen();
        }
    }
}

function updatePageControls() {
    const pageInput = document.getElementById('pageInput');
    const totalPagesSpan = document.getElementById('totalPages');
    const prevBtn = document.getElementById('prevPageBtn');
    const nextBtn = document.getElementById('nextPageBtn');
    
    if (pageInput) pageInput.value = currentPage;
    if (totalPagesSpan) totalPagesSpan.textContent = totalPages;
    if (prevBtn) prevBtn.disabled = currentPage <= 1;
    if (nextBtn) nextBtn.disabled = currentPage >= totalPages;
}

function updateZoomControls() {
    const zoomLevel = document.getElementById('zoomLevel');
    const zoomInBtn = document.getElementById('zoomInBtn');
    const zoomOutBtn = document.getElementById('zoomOutBtn');
    
    if (zoomLevel) zoomLevel.textContent = Math.round(zoomScale * 100) + '%';
    if (zoomInBtn) zoomInBtn.disabled = zoomScale >= 3.0;
    if (zoomOutBtn) zoomOutBtn.disabled = zoomScale <= 0.5;
}

// === СТАТИСТИКА ===

function updateStats() {
    // Обновляем статистику в реальном времени
    if (isFirebaseConnected && !isDemoMode) {
        updateFirestoreStats();
    } else {
        updateLocalStats();
    }
}

function updateStatsPage() {
    // Основная статистика
    document.getElementById('totalPresentationsStats').textContent = stats.totalPresentations || 0;
    document.getElementById('totalViewsStats').textContent = stats.totalViews || 0;
    
    // Количество уникальных тегов
    const allTags = presentations.flatMap(p => p.tags || []);
    const uniqueTags = new Set(allTags);
    document.getElementById('totalTagsStats').textContent = uniqueTags.size;
    
    // Среднее количество просмотров
    const avgViews = presentations.length > 0 ? Math.round(stats.totalViews / presentations.length) : 0;
    document.getElementById('avgViewsStats').textContent = avgViews;
    
    // Популярные презентации
    updatePopularPresentations();
    
    // Статистика по типам файлов
    updateFileTypesStats();
}

function updatePopularPresentations() {
    const popularList = document.getElementById('popularList');
    const sortedPresentations = [...presentations]
        .sort((a, b) => b.views - a.views)
        .slice(0, 5);
    
    if (sortedPresentations.length === 0) {
        popularList.innerHTML = '<div class="popular-item">Нет презентаций</div>';
        return;
    }
    
    popularList.innerHTML = sortedPresentations.map((p, index) => `
        <div class="popular-item">
            <div class="popular-rank">#${index + 1}</div>
            <div class="popular-info">
                <div class="popular-title">${p.title}</div>
                <div class="popular-meta">${formatDate(p.createdAt)} • ${formatFileSize(p.fileSize)}</div>
            </div>
            <div class="popular-views">${p.views} просмотров</div>
        </div>
    `).join('');
}

function updateFileTypesStats() {
    const fileTypesChart = document.getElementById('fileTypesChart');
    const typeStats = {};
    
    presentations.forEach(p => {
        const type = p.fileType.toUpperCase();
        typeStats[type] = (typeStats[type] || 0) + 1;
    });
    
    const maxCount = Math.max(...Object.values(typeStats), 1);
    
    if (Object.keys(typeStats).length === 0) {
        fileTypesChart.innerHTML = '<div class="file-type-item">Нет данных</div>';
        return;
    }
    
    fileTypesChart.innerHTML = Object.entries(typeStats).map(([type, count]) => {
        const percentage = (count / maxCount) * 100;
        const icon = type === 'PDF' ? '📄' : '📊';
        
        return `
            <div class="file-type-item">
                <div class="file-type-icon">${icon}</div>
                <div class="file-type-info">
                    <div class="file-type-name">${type}</div>
                    <div class="file-type-count">${count} файлов</div>
                </div>
                <div class="file-type-bar">
                    <div class="file-type-fill" style="width: ${percentage}%"></div>
                </div>
            </div>
        `;
    }).join('');
}

// === НАСТРОЙКИ ===

function initSettings() {
    const testConnectionBtn = document.getElementById('testConnectionBtn');
    const reconfigureBtn = document.getElementById('reconfigureBtn');
    const exportDataBtn = document.getElementById('exportDataBtn');
    const importDataBtn = document.getElementById('importDataBtn');
    const clearFirestoreBtn = document.getElementById('clearFirestoreBtn');
    
    testConnectionBtn?.addEventListener('click', testConnection);
    reconfigureBtn?.addEventListener('click', reconfigureFirebase);
    exportDataBtn?.addEventListener('click', exportData);
    importDataBtn?.addEventListener('click', importData);
    clearFirestoreBtn?.addEventListener('click', clearFirestore);
}

function updateSettingsPage() {
    const connectionStatus = document.getElementById('connectionStatusText');
    const projectId = document.getElementById('projectIdText');
    const region = document.getElementById('regionText');
    
    if (isDemoMode) {
        connectionStatus.textContent = 'Режим демонстрации';
        projectId.textContent = 'Локальное хранение';
        region.textContent = 'Браузер';
    } else if (isFirebaseConnected) {
        connectionStatus.textContent = 'Подключено';
        const config = JSON.parse(localStorage.getItem('firebaseConfig') || '{}');
        projectId.textContent = config.projectId || '-';
        region.textContent = config.authDomain || '-';
    } else {
        connectionStatus.textContent = 'Отключено';
        projectId.textContent = '-';
        region.textContent = '-';
    }
}

function testConnection() {
    if (isDemoMode) {
        showNotification('В режиме демонстрации используется локальное хранение', 'info');
        return;
    }
    
    if (!db) {
        showNotification('Firebase не подключен', 'error');
        return;
    }
    
    testFirebaseConnection()
        .then(() => showNotification('Соединение с Firebase установлено', 'success'))
        .catch(error => showNotification('Ошибка соединения: ' + error.message, 'error'));
}

function reconfigureFirebase() {
    localStorage.removeItem('firebaseConfig');
    localStorage.removeItem('demoMode');
    location.reload();
}

function exportData() {
    const data = {
        presentations: presentations,
        stats: stats,
        exportDate: new Date().toISOString(),
        version: '1.0'
    };
    
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `presentations-export-${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
    
    showNotification('Данные экспортированы', 'success');
}

function importData() {
    const input = document.getElementById('importFileInput');
    input?.click();
    
    input?.addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        
        try {
            const text = await file.text();
            const data = JSON.parse(text);
            
            if (data.presentations && Array.isArray(data.presentations)) {
                // В демо режиме просто заменяем локальные данные
                if (isDemoMode) {
                    presentations = data.presentations;
                    updateLocalStats();
                    updateCatalog();
                    updateStats();
                    showNotification(`Импортировано ${data.presentations.length} презентаций`, 'success');
                } else {
                    // В режиме Firebase загружаем в Firestore
                    let imported = 0;
                    for (const presentation of data.presentations) {
                        try {
                            await savePresentationToFirestore({
                                ...presentation,
                                id: generateId() // Новый ID для избежания конфликтов
                            });
                            imported++;
                        } catch (error) {
                            console.error('Ошибка импорта презентации:', error);
                        }
                    }
                    
                    if (imported > 0) {
                        await loadPresentations();
                        showNotification(`Импортировано ${imported} презентаций`, 'success');
                    }
                }
            } else {
                showNotification('Неверный формат файла', 'error');
            }
        } catch (error) {
            console.error('Ошибка импорта:', error);
            showNotification('Ошибка импорта: ' + error.message, 'error');
        }
        
        e.target.value = '';
    }, { once: true });
}

async function clearFirestore() {
    const confirmed = confirm('Вы уверены, что хотите очистить всю базу данных? Это действие нельзя отменить.');
    if (!confirmed) return;
    
    if (isDemoMode) {
        presentations = [];
        updateLocalStats();
        updateCatalog();
        updateStats();
        showNotification('Локальные данные очищены', 'info');
        return;
    }
    
    if (!db) {
        showNotification('Firebase не подключен', 'error');
        return;
    }
    
    try {
        const snapshot = await db.collection('presentations').get();
        const batch = db.batch();
        
        snapshot.docs.forEach(doc => {
            batch.delete(doc.ref);
        });
        
        await batch.commit();
        await updateFirestoreStats();
        await loadPresentations();
        
        showNotification('База данных очищена', 'success');
    } catch (error) {
        console.error('Ошибка очистки Firestore:', error);
        showNotification('Ошибка очистки: ' + error.message, 'error');
    }
}

// === ПОДЕЛИТЬСЯ ===

function sharePresentation(id) {
    currentPresentationId = id;
    openShareModal();
}

function openShareModal() {
    const presentation = presentations.find(p => p.id === currentPresentationId);
    if (!presentation) return;
    
    const shareLink = `${window.location.origin}${window.location.pathname}#/presentation/${currentPresentationId}`;
    
    document.getElementById('shareLink').value = shareLink;
    document.getElementById('shareViews').textContent = presentation.views;
    
    // Генерация QR-кода
    generateQRCode(shareLink);
    
    openModal('shareModal');
}

function generateQRCode(url) {
    const qrContainer = document.getElementById('qrCode');
    
    // Используем QR Server API для генерации QR-кода
    const qrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent(url)}`;
    
    qrContainer.innerHTML = `
        <img src="${qrCodeUrl}" 
             alt="QR-код для доступа к презентации" 
             style="width: 150px; height: 150px; border: 1px solid #ddd; border-radius: 8px;"
             onerror="this.parentElement.innerHTML='<div class=\\'qr-mock\\'>QR-код недоступен</div>'"
        />
    `;
}

function copyShareLink() {
    const shareLink = document.getElementById('shareLink');
    shareLink.select();
    shareLink.setSelectionRange(0, 99999);
    
    try {
        document.execCommand('copy');
        showNotification('Ссылка скопирована в буфер обмена!', 'success');
    } catch (err) {
        if (navigator.clipboard) {
            navigator.clipboard.writeText(shareLink.value).then(() => {
                showNotification('Ссылка скопирована в буфер обмена!', 'success');
            }).catch(() => {
                showNotification('Не удалось скопировать ссылку', 'error');
            });
        } else {
            showNotification('Копирование не поддерживается', 'error');
        }
    }
}

// === МОДАЛЬНЫЕ ОКНА ===

function initModals() {
    // Модальное окно поделиться
    const shareBtn = document.getElementById('shareBtn');
    const shareModal = document.getElementById('shareModal');
    const closeShareModalBtn = document.getElementById('closeShareModalBtn');
    const copyLinkBtn = document.getElementById('copyLinkBtn');
    
    shareBtn?.addEventListener('click', () => {
        if (currentPresentationId) {
            openShareModal();
        }
    });
    closeShareModalBtn?.addEventListener('click', () => closeModal('shareModal'));
    copyLinkBtn?.addEventListener('click', copyShareLink);
    
    // Модальное окно конвертации
    const convertHelpBtn = document.getElementById('convertHelpBtn');
    const convertModal = document.getElementById('convertModal');
    const closeConvertModalBtn = document.getElementById('closeConvertModalBtn');
    
    convertHelpBtn?.addEventListener('click', () => openModal('convertModal'));
    closeConvertModalBtn?.addEventListener('click', () => closeModal('convertModal'));
    
    // Закрытие модальных окон по клику на оверлей
    document.querySelectorAll('.modal').forEach(modal => {
        modal.addEventListener('click', (e) => {
            if (e.target === modal || e.target.classList.contains('modal-overlay')) {
                closeModal(modal.id);
            }
        });
    });
    
    // Закрытие по Escape
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            document.querySelectorAll('.modal').forEach(modal => {
                if (!modal.classList.contains('hidden')) {
                    closeModal(modal.id);
                }
            });
        }
    });
}

function openModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
        modal.classList.remove('hidden');
        document.body.style.overflow = 'hidden';
    }
}

function closeModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
        modal.classList.add('hidden');
        document.body.style.overflow = 'auto';
    }
}

// === ПОИСК И СОРТИРОВКА ===

function initSearch() {
    const searchInput = document.getElementById('searchInput');
    const sortSelect = document.getElementById('sortSelect');
    
    searchInput?.addEventListener('input', updateCatalog);
    sortSelect?.addEventListener('change', updateCatalog);
}

// === ТЕМА ===

function initThemeToggle() {
    const themeToggle = document.getElementById('themeToggle');
    
    // Загрузить сохраненную тему
    const savedTheme = localStorage.getItem('theme');
    if (savedTheme === 'dark') {
        enableDarkTheme();
    }
    
    themeToggle?.addEventListener('click', toggleTheme);
}

function toggleTheme() {
    isDarkMode = !isDarkMode;
    
    if (isDarkMode) {
        enableDarkTheme();
    } else {
        enableLightTheme();
    }
    
    localStorage.setItem('theme', isDarkMode ? 'dark' : 'light');
}

function enableDarkTheme() {
    isDarkMode = true;
    document.documentElement.setAttribute('data-color-scheme', 'dark');
    const themeToggle = document.getElementById('themeToggle');
    if (themeToggle) themeToggle.textContent = '☀️';
}

function enableLightTheme() {
    isDarkMode = false;
    document.documentElement.setAttribute('data-color-scheme', 'light');
    const themeToggle = document.getElementById('themeToggle');
    if (themeToggle) themeToggle.textContent = '🌙';
}

// === УВЕДОМЛЕНИЯ ===

function showNotification(message, type = 'info') {
    const notifications = document.getElementById('notifications');
    const notification = document.createElement('div');
    
    notification.className = `notification notification--${type}`;
    notification.textContent = message;
    
    notifications.appendChild(notification);
    
    setTimeout(() => {
        notification.remove();
    }, 5000);
}

// === УТИЛИТЫ ===

function generateId() {
    return 'presentation-' + Math.random().toString(36).substr(2, 9) + '-' + Date.now();
}

function getFileExtension(filename) {
    return filename.slice((filename.lastIndexOf('.') - 1 >>> 0) + 2);
}

function getFileIcon(filename) {
    const ext = getFileExtension(filename).toLowerCase();
    switch(ext) {
        case 'pdf': return '📄';
        case 'pptx':
        case 'ppt': return '📊';
        default: return '📁';
    }
}

function formatFileSize(bytes) {
    if (bytes === 0) return '0 Байт';
    const k = 1024;
    const sizes = ['Байт', 'КБ', 'МБ', 'ГБ'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

function formatDate(dateString) {
    const date = new Date(dateString);
    return date.toLocaleDateString('ru-RU', {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
    });
}

console.log('Мини-хостинг презентаций с Firebase загружен успешно');