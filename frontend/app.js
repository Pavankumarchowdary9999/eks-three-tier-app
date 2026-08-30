const API_BASE_URL = '/api';

document.getElementById('itemForm').addEventListener('submit', async function(e) {
    e.preventDefault();
    const nameInput = document.getElementById('itemName');
    const name = nameInput.value.trim();
    const messageEl = document.getElementById('formMessage');

    if (!name) {
        messageEl.textContent = 'Please enter an item name.';
        messageEl.style.color = 'red';
        return;
    }

    try {
        const response = await fetch(`${API_BASE_URL}/items`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: name })
        });

        if (response.ok) {
            messageEl.textContent = 'Item added successfully!';
            messageEl.style.color = 'green';
            nameInput.value = '';
            loadItems();
        } else {
            const errorText = await response.text();
            messageEl.textContent = `Error: ${errorText}`;
            messageEl.style.color = 'red';
        }
    } catch (error) {
        messageEl.textContent = `Error: Could not connect to backend. ${error.message}`;
        messageEl.style.color = 'red';
    }
});

async function loadItems() {
    const container = document.getElementById('itemsContainer');
    const loadingMsg = document.getElementById('loadingMessage');

    loadingMsg.style.display = 'block';
    container.innerHTML = '';

    try {
        const response = await fetch(`${API_BASE_URL}/items`);
        if (response.ok) {
            const items = await response.json();
            loadingMsg.style.display = 'none';

            if (items.length === 0) {
                container.innerHTML = '<li>No items found. Add one above!</li>';
                return;
            }

            items.forEach(function(item) {
                const li = document.createElement('li');
                const dateStr = item.createdAt ? new Date(item.createdAt).toLocaleString() : 'N/A';
                li.innerHTML = `
                    <span class="item-name">${escapeHtml(item.name)}</span>
                    <span class="item-date">${dateStr}</span>
                `;
                container.appendChild(li);
            });
        } else {
            loadingMsg.textContent = 'Error loading items.';
        }
    } catch (error) {
        loadingMsg.textContent = `Error: Could not connect to backend. ${error.message}`;
    }
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.appendChild(document.createTextNode(text));
    return div.innerHTML;
}

window.addEventListener('DOMContentLoaded', loadItems);
