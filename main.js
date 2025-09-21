
// --- アプリケーションの状態 ---
let currentDate = new Date();
// ラベルデータ構造: { id, date, text, top, left, style: { color, backgroundColor, fontSize, fontWeight, fontStyle } }
let labels = []; 
// テンプレートデータ構造: { name, labels: [{ text, top, left, style }] }
let templates = [];
let currentId = '';
let selectedDateForTemplate = null; // 'YYYY-MM-DD'
let activeLabelInfo = null; // { type, id?, date?, text?, top?, left?, style? }
let clipboard = null; // { text, style }
let dragInfo = null; // { id, element, offsetX, offsetY, hasMoved, startX, startY }
let moveInfo = null; // { labelId } - for tap-based moving on mobile
let clickTimer = null; // for distinguishing single/double clicks
const LOCAL_STORAGE_KEY_LABELS = 'calendar-annotator-labels';
const LOCAL_STORAGE_KEY_TEMPLATES = 'calendar-annotator-templates';

// --- DOM要素 ---
const root = document.getElementById('root');
const popover = document.getElementById('popover');

// --- Data Persistence ---
const saveLabelsToLocalStorage = () => {
    try {
        localStorage.setItem(LOCAL_STORAGE_KEY_LABELS, JSON.stringify({ labels, currentId }));
    } catch (e) { console.error("Failed to save labels:", e); }
};

const loadLabelsFromLocalStorage = () => {
    try {
        const savedData = localStorage.getItem(LOCAL_STORAGE_KEY_LABELS);
        if (savedData) {
            const parsedData = JSON.parse(savedData);
            labels = parsedData.labels || [];
            currentId = parsedData.currentId || '';
        }
    } catch (e) {
        console.error("Failed to load labels:", e);
        labels = [];
        currentId = '';
    }
};

const saveTemplatesToLocalStorage = () => {
    try {
        localStorage.setItem(LOCAL_STORAGE_KEY_TEMPLATES, JSON.stringify(templates));
    } catch (e) { console.error("Failed to save templates:", e); }
};

const loadTemplatesFromLocalStorage = () => {
    try {
        const savedData = localStorage.getItem(LOCAL_STORAGE_KEY_TEMPLATES);
        if (savedData) {
            templates = JSON.parse(savedData) || [];
        }
    } catch (e) {
        console.error("Failed to load templates:", e);
        templates = [];
    }
};

// --- Helper Functions ---
const formatDate = (date) => {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
}

const getLabelStyle = (styleObj) => {
    if (!styleObj) return '';
    return `
        color: ${styleObj.color}; 
        background-color: ${styleObj.backgroundColor}; 
        font-size: ${styleObj.fontSize}px; 
        font-weight: ${styleObj.fontWeight}; 
        font-style: ${styleObj.fontStyle};
    `;
}

// --- Popover Functions ---
const showPopover = (targetElement, type) => {
    const rect = targetElement.getBoundingClientRect();
    let popoverHtml = `<button class="popover-close-btn" data-action="close">&times;</button>`;

    if (type === 'cell') {
        const templateOptionsHtml = templates.map(t => `<option value="${t.name}">${t.name}</option>`).join('');
        popoverHtml += `
            <div class="popover-content">
                <div class="popover-template-section">
                    <label class="popover-section-label" for="popover-template-select">テンプレートを適用</label>
                    <div class="popover-actions">
                       <select id="popover-template-select" style="flex-grow: 2;">
                            <option value="">選択...</option>
                            ${templateOptionsHtml}
                       </select>
                       <button class="popover-btn" data-action="apply-template">適用</button>
                       <button class="popover-btn" data-action="delete-template">削除</button>
                    </div>
                </div>
                <hr>
                <div class="popover-template-section">
                    <label class="popover-section-label" for="new-template-name-input">この日をテンプレートとして保存</label>
                    <div class="popover-actions">
                         <input type="text" id="new-template-name-input" placeholder="新しいテンプレート名" style="flex-grow: 2;">
                         <button class="popover-btn" data-action="save-as-template">保存</button>
                    </div>
                </div>
            </div>`;
        popover.style.left = `${rect.left}px`;
        popover.style.top = `${rect.bottom + 4}px`;
    } else if (type === 'yearMonth') {
        const year = currentDate.getFullYear();
        const month = currentDate.getMonth();
        let monthsHtml = '';
        for (let i = 0; i < 12; i++) {
            const isCurrent = i === month;
            monthsHtml += `<button class="month-grid-item ${isCurrent ? 'current' : ''}" data-month="${i}">${i + 1}月</button>`;
        }
        popoverHtml += `
            <div class="year-month-popover-content">
                <div class="year-selector-header">
                    <button data-action="prev-year">‹</button>
                    <input type="number" id="year-input" value="${year}">
                    <button data-action="next-year">›</button>
                </div>
                <div class="month-grid">${monthsHtml}</div>
                <div class="popover-footer">
                    <button data-action="go-today">今日</button>
                </div>
            </div>`;
         popover.style.left = `${rect.left}px`;
         popover.style.top = `${rect.bottom + 8}px`;

    } else if (type === 'dataOps') {
        popoverHtml += `
            <div class="popover-content">
                <div class="popover-actions" style="flex-direction: column;">
                    <button class="popover-btn" data-action="new">新規作成</button>
                    <button class="popover-btn" data-action="save-json">名前を付けて保存</button>
                    <button class="popover-btn" data-action="import">ファイルから読込</button>
                </div>
            </div>
        `;
        popover.style.left = `${rect.left}px`;
        popover.style.top = `${rect.bottom + 4}px`;
    } else if (type === 'decorate') {
        const style = activeLabelInfo?.style;
        popoverHtml += `
          <div class="popover-content popover-deco-section">
              <div class="deco-control">
                <label>文字色</label>
                <input type="color" value="${style.color}" data-style="color">
              </div>
              <div class="deco-control">
                <label>ラベル色</label>
                <input type="color" value="${style.backgroundColor}" data-style="backgroundColor">
              </div>
              <div class="deco-control">
                <label>大きさ</label>
                <input type="range" value="${style.fontSize}" min="10" max="24" step="1" data-style="fontSize">
                <span class="font-size-value">${style.fontSize}</span>
              </div>
              <div class="deco-control">
                <div class="style-btn-group">
                  <button class="${style.fontWeight === 'bold' ? 'active' : ''}" data-style="fontWeight"><b>B</b></button>
                  <button class="${style.fontStyle === 'italic' ? 'active' : ''}" data-style="fontStyle"><i>I</i></button>
                </div>
              </div>
          </div>
        `;
         popover.style.left = `${rect.right + 8}px`;
         popover.style.top = `${rect.top}px`;
         popover.style.minWidth = 'auto';
    } else { // 'newLabel' or 'existingLabel'
        let buttonsHtml = '';
        if (type === 'newLabel') {
            let pasteButtonHtml = clipboard ? `<button class="popover-btn" data-action="paste">貼付</button>` : '';
            buttonsHtml = `${pasteButtonHtml}<button class="popover-btn" data-action="save">保存</button><button class="popover-btn" data-action="cancel">取消</button>`;
        } else { // 'existingLabel'
            buttonsHtml = `<button class="popover-btn" data-action="update">更新</button><button class="popover-btn" data-action="style">装飾</button><button class="popover-btn" data-action="move">移動</button><button class="popover-btn" data-action="copy">コピー</button><button class="popover-btn" data-action="delete">削除</button>`;
        }
        popoverHtml += `<div class="popover-actions">${buttonsHtml}</div>`;
        popover.style.left = `${rect.right + 8}px`;
        popover.style.top = `${rect.top}px`;
        popover.style.minWidth = 'auto';
    }
    
    popover.innerHTML = popoverHtml;
    popover.style.display = 'block';

    if (window.innerWidth <= 768) {
        popover.style.left = '50%';
        popover.style.top = '50%';
        popover.style.transform = 'translate(-50%, -50%)';
    }
};

const hidePopover = () => {
    if(activeLabelInfo?.id) {
        // If there's an active label, ensure its style changes are saved before clearing.
        const label = labels.find(l => l.id === activeLabelInfo.id);
        if (label) {
            label.style = activeLabelInfo.style;
            saveLabelsToLocalStorage();
        }
    }
    activeLabelInfo = null;
    selectedDateForTemplate = null;
    moveInfo = null; // 移動モードもキャンセル
    popover.style.display = 'none';
    popover.style.minWidth = '280px'; // デフォルトに戻す
    render(); // Re-render to clear editing states
};

// --- イベントハンドラ ---
const handleCalendarClick = (e) => {
    if (moveInfo) {
        const targetCell = e.target.closest('.date-cell');
        if (targetCell) {
            const labelToMove = labels.find(l => l.id === moveInfo.labelId);
            if (labelToMove) {
                const newDate = targetCell.dataset.date;
                const labelsOnNewDate = labels.filter(l => l.date === newDate && l.id !== labelToMove.id).length;
                labelToMove.date = newDate;
                labelToMove.top = 5 + labelsOnNewDate * 28;
                labelToMove.left = 5;
            }
        }
        moveInfo = null;
        saveLabelsToLocalStorage();
        render();
        return;
    }
    
    if (dragInfo && dragInfo.hasMoved) return;

    const clickedLabelEl = e.target.closest('.label');
    const clickedCellEl = e.target.closest('.date-cell');

    if (e.target.closest('#popover')) return;

    const isPopoverVisible = popover.style.display !== 'none';
    if(isPopoverVisible && !clickedLabelEl && !clickedCellEl) {
        hidePopover();
        return;
    }

    const performSingleClickAction = (cellEl) => {
        if (cellEl.classList.contains('other-month')) {
            const dateStr = cellEl.dataset.date;
            const [year, month, day] = dateStr.split('-').map(Number);
            currentDate = new Date(year, month - 1, day);
            hidePopover();
            render();
        } else {
            e.stopPropagation();
            const dateStr = cellEl.dataset.date;
            if (selectedDateForTemplate === dateStr) return;
            
            if (activeLabelInfo) hidePopover();
            
            selectedDateForTemplate = dateStr;
            render();
            showPopover(cellEl, 'cell');
        }
    };

    if (clickedLabelEl) {
        if (clickTimer) clearTimeout(clickTimer);
        e.stopPropagation();
        if (selectedDateForTemplate) {
            selectedDateForTemplate = null;
            render();
        }
        const labelId = Number(clickedLabelEl.dataset.id);
        if (activeLabelInfo?.id === labelId) return;
        
        if (activeLabelInfo) hidePopover();

        const labelData = labels.find(l => l.id === labelId);
        activeLabelInfo = { type: 'existing', id: labelId, style: { ...labelData.style } };
        render(); 
        
        setTimeout(() => {
            const activeLabelEl = document.querySelector(`.label[data-id="${labelId}"]`);
            if (activeLabelEl) {
                showPopover(activeLabelEl, 'existingLabel');
            }
        }, 0);
    } else if (clickedCellEl) {
        clearTimeout(clickTimer);
        clickTimer = setTimeout(() => {
            performSingleClickAction(clickedCellEl);
        }, 250);
    }
};

const handleCalendarDblClick = (e) => {
    if (clickTimer) clearTimeout(clickTimer);

    const clickedCellEl = e.target.closest('.date-cell:not(.other-month)');
    if (!clickedCellEl || moveInfo) return;
    
    hidePopover();

    const dateStr = clickedCellEl.dataset.date;
    const labelsOnDate = labels.filter(l => l.date === dateStr).length;
    
    const newLabel = {
        id: Date.now(),
        date: dateStr,
        text: '新規ラベル',
        top: 5 + labelsOnDate * 28,
        left: 5,
        style: {
            color: '#333333',
            backgroundColor: '#fffbe6',
            fontSize: '13',
            fontWeight: 'normal',
            fontStyle: 'normal',
        }
    };
    labels.push(newLabel);

    activeLabelInfo = { type: 'new', id: newLabel.id, style: { ...newLabel.style } };
    render();

    setTimeout(() => {
        const newLabelEl = document.querySelector(`.label[data-id="${newLabel.id}"]`);
        if (newLabelEl) {
            newLabelEl.contentEditable = true;
            newLabelEl.focus();
            document.execCommand('selectAll', false, null);
            showPopover(newLabelEl, 'newLabel');

            const saveOnBlur = () => {
                newLabelEl.contentEditable = false;
                const label = labels.find(l => l.id === newLabel.id);
                if(label) label.text = newLabelEl.innerText.trim();
                hidePopover();
                newLabelEl.removeEventListener('blur', saveOnBlur);
            };
            newLabelEl.addEventListener('blur', saveOnBlur);
        }
    }, 0);
};

const handleDecorationPopoverInput = (e) => {
    const target = e.target.closest('[data-style]');
    if (!target || !activeLabelInfo) return;

    const styleProp = target.dataset.style;
    let value = target.value;

    const isToggleButton = target.tagName === 'BUTTON';
    const targetStyle = activeLabelInfo.style;

    if (isToggleButton) {
        const currentVal = targetStyle[styleProp];
        if (styleProp === 'fontWeight') value = currentVal === 'bold' ? 'normal' : 'bold';
        if (styleProp === 'fontStyle') value = currentVal === 'italic' ? 'normal' : 'italic';
        target.classList.toggle('active');
    } else if (styleProp === 'fontSize') {
        const valueSpan = target.nextElementSibling;
        if (valueSpan?.classList.contains('font-size-value')) {
            valueSpan.textContent = value;
        }
    }
    
    targetStyle[styleProp] = value;
    
    const activeLabelEl = document.querySelector(`.label[data-id="${activeLabelInfo.id}"]`);
    if (activeLabelEl) {
         if(styleProp === 'fontSize') {
            activeLabelEl.style.fontSize = `${value}px`;
        } else {
            activeLabelEl.style[styleProp] = value;
        }
    }
};


const handlePopoverAction = (e) => {
    if (e.target.closest('.popover-deco-section')) {
        handleDecorationPopoverInput(e);
        return;
    }

    const action = e.target.dataset.action;
    const month = e.target.dataset.month;
    if (!action && month === undefined) return;

    if(month !== undefined) {
         const newYear = parseInt(popover.querySelector('#year-input').value, 10);
         if(!isNaN(newYear)) currentDate.setFullYear(newYear);
         currentDate.setMonth(parseInt(month, 10));
         hidePopover();
         return;
    }

    if (action === 'close') {
        hidePopover();
        return;
    }

    // --- Data Ops popover actions
    if (action === 'new') { handleNew(); hidePopover(); return; }
    if (action === 'save-json') { handleSave(); hidePopover(); return; }
    if (action === 'import') { handleImport(); hidePopover(); return; }


    switch(action) {
        case 'prev-year': {
            const yearInput = popover.querySelector('#year-input');
            const currentYear = parseInt(yearInput.value, 10);
            if (!isNaN(currentYear)) {
              yearInput.value = currentYear - 1;
              // No need to re-render popover here
            }
            return;
        }
        case 'next-year': {
            const yearInput = popover.querySelector('#year-input');
            const currentYear = parseInt(yearInput.value, 10);
            if (!isNaN(currentYear)) {
              yearInput.value = currentYear + 1;
            }
            return;
        }
        case 'go-today':
             currentDate = new Date();
             hidePopover();
             return;
    }
    
    const activeLabelEl = document.querySelector(`.label[data-id="${activeLabelInfo?.id}"]`);

    switch(action) {
        case 'save':
             if (activeLabelInfo?.type === 'new' && activeLabelEl) {
                const label = labels.find(l => l.id === activeLabelInfo.id);
                if(label) label.text = activeLabelEl.innerText.trim();
             }
             hidePopover();
            break;
        case 'update':
            if (activeLabelInfo?.type === 'existing' && activeLabelEl) {
               activeLabelEl.contentEditable = true;
               activeLabelEl.focus();
               document.execCommand('selectAll', false, null);
               popover.style.display = 'none';

               const saveOnBlur = () => {
                   activeLabelEl.contentEditable = false;
                   const label = labels.find(l => l.id === activeLabelInfo.id);
                   if (label) label.text = activeLabelEl.innerText.trim();
                   hidePopover();
                   activeLabelEl.removeEventListener('blur', saveOnBlur);
               };
               activeLabelEl.addEventListener('blur', saveOnBlur);
            }
            return; // Do not hide popover yet
        case 'delete':
            if (activeLabelInfo?.type === 'existing') {
                labels = labels.filter(l => l.id !== activeLabelInfo.id);
            }
            hidePopover();
            break;
        case 'copy':
            if (activeLabelInfo?.type === 'existing') {
                const labelToCopy = labels.find(l => l.id === activeLabelInfo.id);
                if (labelToCopy) {
                    clipboard = { text: labelToCopy.text, style: { ...labelToCopy.style } };
                }
            }
            hidePopover();
            break;
        case 'paste':
            if (activeLabelInfo?.type === 'new' && clipboard) {
               const label = labels.find(l => l.id === activeLabelInfo.id);
               if (label) {
                   label.text = clipboard.text;
                   label.style = {...clipboard.style};
               }
            }
            hidePopover();
            break;
        case 'move':
            e.stopPropagation();
            if (activeLabelInfo?.type === 'existing') {
                moveInfo = { labelId: activeLabelInfo.id };
                popover.style.display = 'none';
                activeLabelInfo = null;
                render();
            }
            return;
        case 'style':
            if (activeLabelInfo?.type === 'existing' && activeLabelEl) {
                showPopover(activeLabelEl, 'decorate');
            }
            return;
        case 'cancel':
             if (activeLabelInfo?.type === 'new') {
                labels = labels.filter(l => l.id !== activeLabelInfo.id);
             }
            hidePopover();
            break;
        
        case 'save-as-template': {
            if (!selectedDateForTemplate) return;
            const templateNameInput = document.getElementById('new-template-name-input');
            const templateName = templateNameInput.value.trim();

            if (!templateName) { alert('テンプレート名を入力してください。'); templateNameInput.focus(); return; }

            const labelsOnDate = labels.filter(l => l.date === selectedDateForTemplate);
            if (labelsOnDate.length === 0) { alert('テンプレートとして保存するラベルがありません。'); return; }
            
            if (templates.some(t => t.name === templateName)) {
                if (!confirm(`テンプレート名 "${templateName}" は既に存在します。上書きしますか？`)) return;
                templates = templates.filter(t => t.name !== templateName);
            }

            const templateLabels = labelsOnDate.map(({ text, top, left, style }) => ({ text, top, left, style: {...style} }));
            templates.push({ name: templateName, labels: templateLabels });
            templates.sort((a, b) => a.name.localeCompare(b.name));
            saveTemplatesToLocalStorage();
            alert(`テンプレート "${templateName}" を保存しました。`);
            hidePopover();
            break;
        }
        case 'apply-template':
            if (!selectedDateForTemplate) return;
            const templateSelect = document.getElementById('popover-template-select');
            const selectedTemplateName = templateSelect.value;
            if (!selectedTemplateName) { alert('適用するテンプレートを選択してください。'); return; }

            const template = templates.find(t => t.name === selectedTemplateName);
            if (template) {
                template.labels.forEach(templateLabel => {
                    labels.push({
                        id: Date.now() + Math.random(),
                        date: selectedDateForTemplate,
                        text: templateLabel.text,
                        top: templateLabel.top,
                        left: templateLabel.left,
                        style: { ...templateLabel.style }
                    });
                });
                render();
            }
            break;
         case 'delete-template':
            if (!selectedDateForTemplate) return;
            const templateToDelete = document.getElementById('popover-template-select').value;
            if (!templateToDelete) { alert('削除するテンプレートを選択してください。'); return; }
            if (confirm(`テンプレート "${templateToDelete}" を削除しますか？`)) {
                templates = templates.filter(t => t.name !== templateToDelete);
                saveTemplatesToLocalStorage();
                const cellEl = document.querySelector(`.date-cell[data-date="${selectedDateForTemplate}"]`);
                if (cellEl) showPopover(cellEl, 'cell');
            }
            break;
    }
};

const handleDocumentClick = (e) => {
    if (e.target.closest('#popover') || 
        e.target.closest('.year-month-selector') ||
        e.target.closest('.id-control')) {
        return;
    }

    if (e.target.closest('.label.editing')) return;
    
    if (popover.style.display !== 'none') {
        hidePopover();
    } else if (activeLabelInfo || selectedDateForTemplate) {
        hidePopover();
    }
};

// --- Drag and Drop Handlers ---
const handleDragStart = (e) => {
    if (window.matchMedia("(pointer: coarse)").matches) return;
    
    const labelEl = e.target.closest('.label');
    if (!labelEl || labelEl.isContentEditable || moveInfo) return;

    hidePopover();

    const rect = labelEl.getBoundingClientRect();
    
    dragInfo = {
        id: Number(labelEl.dataset.id),
        element: labelEl,
        offsetX: e.clientX - rect.left,
        offsetY: e.clientY - rect.top,
        hasMoved: false,
        startX: e.clientX,
        startY: e.clientY,
    };

    document.addEventListener('mousemove', handleDragging);
    document.addEventListener('mouseup', handleDragEnd, { once: true });
};

const handleDragging = (e) => {
    if (!dragInfo) return;

    if (!dragInfo.hasMoved) {
        const dx = e.clientX - dragInfo.startX;
        const dy = e.clientY - dragInfo.startY;
        if (Math.sqrt(dx * dx + dy * dy) < 5) return;

        dragInfo.hasMoved = true;
        const labelEl = dragInfo.element;
        const computedStyle = window.getComputedStyle(labelEl);
        labelEl.classList.add('dragging');
        labelEl.style.width = computedStyle.width;
        document.body.appendChild(labelEl);
    }

    dragInfo.element.style.top = `${e.clientY - dragInfo.offsetY}px`;
    dragInfo.element.style.left = `${e.clientX - dragInfo.offsetX}px`;
};

const handleDragEnd = (e) => {
    if (!dragInfo) return;

    const wasDragging = dragInfo.hasMoved;
    const draggedEl = dragInfo.element;

    document.removeEventListener('mousemove', handleDragging);

    if (!wasDragging) { dragInfo = null; return; }
    
    draggedEl.style.visibility = 'hidden';
    const elementBelow = document.elementFromPoint(e.clientX, e.clientY);
    draggedEl.style.visibility = 'visible';
    
    const targetCell = elementBelow?.closest('.date-cell:not(.other-month)');

    if (targetCell) {
        const newDate = targetCell.dataset.date;
        const labelsContainer = targetCell.querySelector('.labels-container');
        const containerRect = labelsContainer.getBoundingClientRect();
        
        const newTop = e.clientY - containerRect.top - dragInfo.offsetY;
        const newLeft = e.clientX - containerRect.left - dragInfo.offsetX;

        const labelToUpdate = labels.find(l => l.id === dragInfo.id);
        if (labelToUpdate) {
            labelToUpdate.date = newDate;
            labelToUpdate.top = Math.max(0, newTop);
            labelToUpdate.left = Math.max(0, newLeft);
        }
    }
    
    draggedEl.remove();
    dragInfo = null;
    saveLabelsToLocalStorage();
    render(); 
};

// --- Data I/O Handlers ---
const handleNew = () => {
    if (labels.length > 0 && !confirm('現在のラベルをすべてクリアして、新規作成しますか？\n保存していない変更は失われます。')) return;

    labels = [];
    currentId = '';
    selectedDateForTemplate = null;
    saveLabelsToLocalStorage();
    render();
    
    if (window.innerWidth <= 768) {
        const idInput = document.getElementById('calendar-id');
        idInput.readOnly = false;
        idInput.focus();
        idInput.select();
        idInput.addEventListener('blur', () => { idInput.readOnly = true; }, { once: true });
    }
};

const handleSave = () => {
    const idInput = document.getElementById('calendar-id');
    currentId = idInput.value.trim();

    if (!currentId) { alert('IDを入力してください。'); idInput.focus(); return; }
    
    const now = new Date();
    const timestamp = `${now.getFullYear()}${(now.getMonth() + 1).toString().padStart(2, '0')}${now.getDate().toString().padStart(2, '0')}_${now.getHours().toString().padStart(2, '0')}${now.getMinutes().toString().padStart(2, '0')}${now.getSeconds().toString().padStart(2, '0')}`;
    const filename = `${currentId}_${timestamp}.json`;

    const dataStr = JSON.stringify(labels, null, 2);
    const dataBlob = new Blob([dataStr], {type: "application/json"});
    const url = URL.createObjectURL(dataBlob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
};

const handleImport = () => {
    const fileInput = document.getElementById('file-importer');
    fileInput.onchange = e => {
        const file = e.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = event => {
            try {
                const importedData = JSON.parse(event.target.result);
                if (Array.isArray(importedData)) {
                    labels = importedData;
                    const fileName = file.name;
                    currentId = fileName.lastIndexOf('.') > 0 ? fileName.substring(0, fileName.lastIndexOf('.')) : fileName;
                    
                    saveLabelsToLocalStorage();
                    render();
                    alert('データを正常に読み込みました。');
                } else {
                    alert('エラー: JSONファイルが正しい配列形式ではありません。');
                }
            } catch (error) {
                alert(`エラー: ファイルの読み込みに失敗しました。\n${error.message}`);
            } finally {
                fileInput.value = '';
            }
        };
        reader.readAsText(file);
    };
    fileInput.click();
};

// --- レンダリング関数 ---
const render = () => {
  document.body.classList.toggle('is-moving-label', !!moveInfo);

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();
  const firstDayOfMonth = new Date(year, month, 1);
  const lastDayOfMonth = new Date(year, month + 1, 0);
  const startDate = new Date(firstDayOfMonth);
  startDate.setDate(startDate.getDate() - firstDayOfMonth.getDay());
  const endDate = new Date(lastDayOfMonth);
  endDate.setDate(endDate.getDate() + (6 - lastDayOfMonth.getDay()));
  const dates = [];
  let currentDatePointer = new Date(startDate);
  while (currentDatePointer <= endDate) {
    dates.push(new Date(currentDatePointer));
    currentDatePointer.setDate(currentDatePointer.getDate() + 1);
  }
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const dayHeaders = ['日', '月', '火', '水', '木', '金', '土'];
  const dayHeadersHtml = dayHeaders.map((day, index) => `
    <div class="day-header ${index === 0 ? 'sunday' : ''} ${index === 6 ? 'saturday' : ''}" role="columnheader">
      ${day}
    </div>
  `).join('');

  const dateCellsHtml = dates.map(date => {
    const isOtherMonth = date.getMonth() !== month;
    const isToday = date.getTime() === today.getTime();
    const dayOfWeek = date.getDay();
    const isSunday = dayOfWeek === 0;
    const isSaturday = dayOfWeek === 6;
    const dateStr = formatDate(date);
    const isSelectedForTemplate = selectedDateForTemplate === dateStr;
    const cellClasses = ['date-cell', isOtherMonth ? 'other-month' : '', isSelectedForTemplate ? 'selected-for-template' : ''].filter(Boolean).join(' ');
    const numberClasses = ['date-number', isToday ? 'today' : '', !isToday && isSunday ? 'sunday' : '', !isToday && isSaturday ? 'saturday' : ''].filter(Boolean).join(' ');

    const labelsForDate = labels.filter(label => label.date === dateStr);
    let labelsHtml = labelsForDate.map(label => {
        const isEditing = activeLabelInfo?.id === label.id;
        const isBeingMoved = moveInfo?.labelId === label.id;
        const classes = `label ${isEditing ? 'editing' : ''} ${isBeingMoved ? 'is-being-moved' : ''}`;
        const style = getLabelStyle(label.style);
        return `<div class="${classes}" data-id="${label.id}" style="top: ${label.top}px; left: ${label.left}px; ${style}">${label.text}</div>`;
    }).join('');
    
    return `
      <div class="${cellClasses}" data-date="${dateStr}">
        <div class="${numberClasses}">${date.getDate()}</div>
        <div class="labels-container">${labelsHtml}</div>
      </div>`;
  }).join('');
  
  const isMobile = window.innerWidth <= 768;

  const appHtml = `
    <div class="app-container">
      <header class="header">
        <div class="header-top">
            <div class="header-title-bar">
                <h1 class="header-title">
                    <span id="year-month-selector" class="year-month-selector" title="年月を変更">
                    ${year}年 ${month + 1}月
                    </span>
                </h1>
                <div id="id-control-container" class="id-control">
                    <input type="text" id="calendar-id" placeholder="スケジュール名を入力" ${isMobile ? 'readonly' : ''}>
                </div>
            </div>
            <div class="data-ops">
                <button id="new-btn" data-action="new">新規</button>
                <button id="save-btn" data-action="save-json">保存</button>
                <button id="import-btn" data-action="import">読込</button>
            </div>
        </div>
      </header>
      <main class="calendar-board" aria-label="カレンダー">
        <div class="calendar-grid" id="calendar-grid">
          ${dayHeadersHtml}
          ${dateCellsHtml}
        </div>
      </main>
    </div>`;

  root.innerHTML = appHtml;

  // --- イベントリスナーの登録 ---
  document.getElementById('year-month-selector').addEventListener('click', (e) => {
    const newYear = parseInt(popover.querySelector('#year-input')?.value, 10);
    if(!isNaN(newYear)) currentDate.setFullYear(newYear);
    e.stopPropagation();
    if (popover.style.display !== 'none' && popover.querySelector('.year-month-popover-content')) {
        hidePopover();
    } else {
        showPopover(e.currentTarget, 'yearMonth');
    }
  });
  
  const dataOpsContainer = document.querySelector('.data-ops');
  if (dataOpsContainer) {
      dataOpsContainer.addEventListener('click', (e) => {
          const action = e.target.dataset.action;
          if (action === 'new') handleNew();
          if (action === 'save-json') handleSave();
          if (action === 'import') handleImport();
      });
  }

  const idControlContainer = document.getElementById('id-control-container');
  idControlContainer.addEventListener('click', (e) => {
    if (window.innerWidth > 768) return;
    const idInput = document.getElementById('calendar-id');
    if (idInput && !idInput.readOnly) return;
    e.stopPropagation();
    showPopover(idControlContainer, 'dataOps');
  });
  
  const idInput = document.getElementById('calendar-id');
  idInput.value = currentId;
  idInput.addEventListener('input', e => { currentId = e.target.value; });

  const calendarGrid = document.getElementById('calendar-grid');
  calendarGrid.addEventListener('click', handleCalendarClick);
  calendarGrid.addEventListener('dblclick', handleCalendarDblClick);
  calendarGrid.addEventListener('mousedown', handleDragStart);

  popover.addEventListener('click', handlePopoverAction);
  
  document.removeEventListener('click', handleDocumentClick);
  document.addEventListener('click', handleDocumentClick);
};

// --- 初期化 ---
const initialize = () => {
    loadLabelsFromLocalStorage();
    loadTemplatesFromLocalStorage();
    render();
};

initialize();
