/**
 * Script.js DEFINITIVO para o Tema Preciazo
 * Inclui lógica para Home, Coleções, Carrinho, Busca, Favoritos e todas as interações de UI.
 */
document.addEventListener('DOMContentLoaded', function () {

    // --- Configurações Globais e Estado --- //
    let favorites = JSON.parse(localStorage.getItem('preciazoFavorites')) || [];
    const shippingThreshold = 5000; // €50 em centavos

    // --- Funções Auxiliares de UI --- //
    const saveFavorites = () => localStorage.setItem('preciazoFavorites', JSON.stringify(favorites));
    const formatPrice = (cents) => {
        if (typeof cents !== 'number') return (0).toLocaleString('es-ES', { style: 'currency', currency: 'EUR' });
        return (cents / 100).toLocaleString('es-ES', { style: 'currency', currency: 'EUR' });
    };

    function showToast(message, isSuccess = true) {
        document.querySelectorAll('.toast').forEach(t => t.remove());
        const toast = document.createElement('div');
        toast.className = `toast`;
        toast.innerHTML = `<i class="fa-solid ${isSuccess ? 'fa-circle-check' : 'fa-circle-xmark'}"></i> ${message}`;
        document.body.appendChild(toast);
        setTimeout(() => toast.classList.add('show'), 10);
        setTimeout(() => {
            toast.classList.remove('show');
            setTimeout(() => toast.remove(), 500);
        }, 3000);
    }

    function showModal(id) {
        const modal = document.getElementById(id);
        if (modal) modal.classList.add('active');
    }

    function closeModal(id) {
        const modal = document.getElementById(id);
        if (modal) modal.classList.remove('active');
    }

    // --- Lógica do Carrinho Shopify --- //
    const updateCartCounter = (cart) => {
        const totalItems = cart ? cart.item_count : 0;
        document.querySelectorAll('#cart-counter').forEach(counter => {
            counter.textContent = totalItems;
            counter.style.display = totalItems > 0 ? 'flex' : 'none';
        });
    };

    const updateCartUI = async () => {
        try {
            const res = await fetch('/cart.js');
            if (!res.ok) return;
            const cart = await res.json();
            renderCartSidebar(cart);
            updateCartCounter(cart);
        } catch (error) { console.error('Erro ao buscar o carrinho:', error); }
    };

    const renderCartSidebar = (cart) => {
        const sidebar = document.getElementById('cart-sidebar');
        if (!sidebar) return;
        const remainingForFreeShipping = Math.max(0, shippingThreshold - cart.total_price);
        const progressPercent = Math.min(100, (cart.total_price / shippingThreshold) * 100);
        let shippingBarHTML = '';
        if (cart.total_price > 0 && remainingForFreeShipping > 0) {
            shippingBarHTML = `<p>¡Gasta <strong>${formatPrice(remainingForFreeShipping)}</strong> más para conseguir envío gratis!</p><div class="progress-bar"><div class="progress-bar-fill" style="width: ${progressPercent}%;"></div></div>`;
        } else if (cart.total_price >= shippingThreshold) {
            shippingBarHTML = `<p class="shipping-unlocked"><i class="fas fa-check-circle"></i> ¡Felicidades! Tienes envío gratis.</p>`;
        }
        if (cart.item_count === 0) {
            sidebar.innerHTML = `<div class="cart-header"><h3>Tu Carrito</h3><button class="close-modal-btn" aria-label="Cerrar">×</button></div><div class="cart-body cart-empty"><i class="fa-solid fa-cart-shopping"></i><p>Tu carrito está vacío</p></div><div class="cart-footer"><a href="/collections/all" class="button-primary close-sidebar-btn">Continuar a comprar</a></div>`;
        } else {
            const cartItemsHTML = cart.items.map(item => `
                <div class="cart-item" data-key="${item.key}">
                    <a href="${item.url}"><img src="${item.image}" alt="${item.title}" class="cart-item-image"></a>
                    <div class="cart-item-info"><a href="${item.url}" class="cart-item-name">${item.product_title}</a><p class="cart-item-price">${formatPrice(item.final_price)}</p></div>
                    <div class="cart-item-actions">
                        <div class="quantity-control-sidebar">
                            <button class="qty-btn-sidebar decrease-qty-sidebar" data-key="${item.key}">-</button>
                            <input type="number" class="item-quantity-sidebar" value="${item.quantity}" min="1" data-key="${item.key}"><button class="qty-btn-sidebar increase-qty-sidebar" data-key="${item.key}">+</button>
                        </div>
                        <a href="#" class="cart-remove-btn" data-key="${item.key}">Remover</a>
                    </div>
                </div>`).join('');
            sidebar.innerHTML = `<div class="cart-header"><h3>Tu Carrito (${cart.item_count})</h3><button class="close-modal-btn" aria-label="Cerrar">×</button></div>${shippingBarHTML ? `<div class="free-shipping-bar">${shippingBarHTML}</div>` : ''}<div class="cart-body">${cartItemsHTML}</div><div class="cart-footer"><div class="cart-subtotal"><span>Subtotal</span><span>${formatPrice(cart.total_price)}</span></div><a href="/cart" class="button-primary">Ver Carrito</a></div>`;
        }
    };

    const openCartSidebar = () => {
        document.getElementById('cart-overlay')?.classList.add('active');
        document.getElementById('cart-sidebar')?.classList.add('active');
    };

    const handleAddToCart = async (variantId, quantity) => {
        try {
            await fetch('/cart/add.js', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ items: [{ id: variantId, quantity: quantity }] }) });
            showToast('Producto añadido al carrito');
            await updateCartUI();
            openCartSidebar();
        } catch (error) { console.error(error); showToast('Error al añadir el producto.', false); }
    };

    const handleUpdateCart = async (key, quantity) => {
        try {
            // CORREÇÃO: A API do Shopify espera a 'line key' completa, não precisa do split.
            const res = await fetch('/cart/change.js', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ line: key, quantity: quantity })
            });
            const cartData = await res.json();
            if (!res.ok) {
                showToast(cartData.description || 'Error al actualizar el carrito.', false);
                return;
            }
            renderCartSidebar(cartData);
            updateCartCounter(cartData);
            if (document.body.classList.contains('template-cart') && quantity > 0) {
                window.location.href = '/cart';
            }
        } catch (error) {
            console.error(error);
            showToast('Error al actualizar el carrito.', false);
        }
    };

    // --- Lógica de Busca --- //
    async function renderSearchSuggestions(searchTerm) {
        const suggestionsContainer = document.getElementById('search-suggestions');
        if (!suggestionsContainer || !searchTerm.trim()) {
            if (suggestionsContainer) { suggestionsContainer.innerHTML = ''; suggestionsContainer.style.display = 'none'; }
            return;
        }
        try {
            const response = await fetch(`/search/suggest.json?q=${searchTerm}&resources[type]=product&resources[limit]=5`);
            const data = await response.json();
            const products = data.resources.results.products;
            if (products.length > 0) {
                suggestionsContainer.innerHTML = products.map(product => `<a href="${product.url}" class="suggestion-item"><img src="${product.image}" alt="${product.title}"><div class="info"><span class="name">${product.title}</span><span class="price">${product.price}</span></div></a>`).join('');
            } else {
                suggestionsContainer.innerHTML = '<div class="no-suggestions">No se encontraron productos.</div>';
            }
            suggestionsContainer.style.display = 'block';
        } catch (error) { console.error("Erro ao buscar sugestões:", error); }
    }

    // --- INICIALIZAÇÃO E EVENTOS --- //
    function init() {
        initAnnouncementBar();
        initSwipers();
        updateCartUI();
        addEventListeners();
        initCollectionPage();
        favorites.forEach(id => {
            document.querySelectorAll(`.favorite-btn[data-product-id="${id}"]`).forEach(btn => btn.classList.add('active'));
        });
    }

    function initAnnouncementBar() {
        const container = document.querySelector('.anuncios-rotativos');
        if (!container) return;
        const items = container.querySelectorAll('.anuncio-item');
        if (items.length <= 1) return;
        const prevBtn = document.querySelector('.anuncio-nav-btn.prev');
        const nextBtn = document.querySelector('.anuncio-nav-btn.next');
        if (!prevBtn || !nextBtn) return;
        let index = 0;
        let interval = setInterval(() => next(), 4000);
        const show = i => items.forEach((item, idx) => item.classList.toggle('active', idx === i));
        const next = () => { index = (index + 1) % items.length; show(index); };
        const prev = () => { index = (index - 1 + items.length) % items.length; show(index); };
        const resetInterval = () => { clearInterval(interval); interval = setInterval(next, 4000); };
        nextBtn.addEventListener('click', () => { next(); resetInterval(); });
        prevBtn.addEventListener('click', () => { prev(); resetInterval(); });
    }

    function initSwipers() {
        if (typeof Swiper === 'undefined') {
            console.error('Swiper library not loaded.');
            return;
        }
        if (document.querySelector('.hero-slider')) {
            const heroEl = document.querySelector('.hero-slider');
            const swiper = new Swiper(heroEl, { loop: true, effect: 'fade', autoplay: { delay: 5000 }, pagination: { el: '.swiper-pagination', clickable: true }, navigation: { nextEl: '.swiper-button-next', prevEl: '.swiper-button-prev' } });
            const pauseBtn = heroEl.querySelector('.swiper-pause-button');
            if (pauseBtn) {
                const icon = pauseBtn.querySelector('i');
                pauseBtn.addEventListener('click', () => swiper.autoplay.running ? swiper.autoplay.stop() : swiper.autoplay.start());
                swiper.on('autoplayStop', () => { if (icon) icon.className = 'fas fa-play'; heroEl.classList.add('autoplay-paused'); });
                swiper.on('autoplayStart', () => { if (icon) icon.className = 'fas fa-pause'; heroEl.classList.remove('autoplay-paused'); });
            }
        }
        document.querySelectorAll('.featured-slider-wrapper').forEach(w => {
            const slider = w.querySelector('.swiper');
            if (slider) new Swiper(slider, { spaceBetween: 25, slidesPerView: 2, pagination: { el: w.querySelector('.swiper-pagination'), type: 'progressbar' }, navigation: { nextEl: w.querySelector('.swiper-button-next'), prevEl: w.querySelector('.swiper-button-prev') }, breakpoints: { 768: { slidesPerView: 3 }, 1024: { slidesPerView: 4 } } });
        });
    }

    function initCollectionPage() {
        const sidebar = document.querySelector('.filter-sidebar');
        if (!sidebar) return;
        const productGrid = document.getElementById('product-grid-collection');
        const allProducts = Array.from(productGrid.querySelectorAll('.product-card'));
        if (allProducts.length === 0) {
            sidebar.querySelectorAll('input, select, button').forEach(el => el.disabled = true);
            return;
        }

        const searchInput = document.getElementById('search-input');
        const minPriceRange = document.getElementById('min-price-range');
        const maxPriceRange = document.getElementById('max-price-range');
        const minPriceInput = document.getElementById('min-price-input');
        const maxPriceInput = document.getElementById('max-price-input');
        const priceProgress = document.getElementById('price-range-progress');
        const sortBySelect = document.getElementById('sort-by');
        const resetBtn = document.getElementById('reset-filters');
        const productCountEl = document.getElementById('product-count');

        // --- INÍCIO DA CORREÇÃO DEFINITIVA ---
        const minPriceCents = parseInt(sidebar.dataset.minPriceCents, 10);
        const maxPriceCents = parseInt(sidebar.dataset.maxPriceCents, 10);

        // Verifica se os dados do HTML são números válidos. Se não forem, a função para.
        if (isNaN(minPriceCents) || isNaN(maxPriceCents)) {
            console.error('Dados da faixa de preço inválidos (data-attributes).');
            return;
        }

        // Converte centavos para euros, arredondando para baixo (min) e para cima (max).
        const minPriceValue = Math.floor(minPriceCents / 100);
        let maxPriceValue = Math.ceil(maxPriceCents / 100);

        // Garante que o valor máximo seja sempre maior que o mínimo, evitando um slider quebrado.
        if (minPriceValue >= maxPriceValue) {
            maxPriceValue = minPriceValue + 1;
        }

        // Configura os valores iniciais de TODOS os inputs (range e number)
        minPriceRange.min = minPriceInput.min = minPriceValue;
        minPriceRange.max = minPriceInput.max = maxPriceValue;
        minPriceRange.value = minPriceInput.value = minPriceValue;

        maxPriceRange.min = maxPriceInput.min = minPriceValue;
        maxPriceRange.max = maxPriceInput.max = maxPriceValue;
        maxPriceRange.value = maxPriceInput.value = maxPriceValue;
        // --- FIM DA CORREÇÃO DEFINITIVA ---

        const updatePriceSliderUI = () => {
            const minVal = parseFloat(minPriceInput.value);
            const maxVal = parseFloat(maxPriceInput.value);
            if (maxVal >= minVal && priceProgress) {
                const range = maxPriceValue - minPriceValue;
                priceProgress.style.left = range > 0 ? ((minVal - minPriceValue) / range) * 100 + '%' : '0%';
                priceProgress.style.right = range > 0 ? 100 - (((maxVal - minPriceValue) / range) * 100) + '%' : '0%';
            }
        };

        const applyFilters = () => {
            const searchTerm = searchInput.value.toLowerCase();
            const minPrice = parseFloat(minPriceInput.value) * 100;
            const maxPrice = parseFloat(maxPriceInput.value) * 100;
            let visibleCount = 0;
            allProducts.forEach(product => {
                const name = product.dataset.name.toLowerCase();
                const price = parseFloat(product.dataset.price);
                const nameMatch = name.includes(searchTerm);
                const priceMatch = price >= minPrice && price <= maxPrice;
                if (nameMatch && priceMatch) {
                    product.style.display = '';
                    visibleCount++;
                } else {
                    product.style.display = 'none';
                }
            });
            productCountEl.textContent = `${visibleCount} productos`;
        };

        const sortProducts = () => {
            const sortOption = sortBySelect.value;
            const sorted = [...allProducts].sort((a, b) => {
                switch (sortOption) {
                    case 'price-ascending': return parseFloat(a.dataset.price) - parseFloat(b.dataset.price);
                    case 'price-descending': return parseFloat(b.dataset.price) - parseFloat(a.dataset.price);
                    case 'title-ascending': return a.dataset.name.localeCompare(b.dataset.name);
                    case 'title-descending': return b.dataset.name.localeCompare(a.dataset.name);
                    default: return 0;
                }
            });
            sorted.forEach(product => productGrid.appendChild(product));
        };

        let filterTimeout;
        const debouncedApplyFilters = () => {
            clearTimeout(filterTimeout);
            filterTimeout = setTimeout(applyFilters, 250);
        };

        [searchInput, minPriceInput, maxPriceInput, minPriceRange, maxPriceRange].forEach(el => {
            el.addEventListener('input', (e) => {
                if (e.target.type === 'range') {
                    minPriceInput.value = minPriceRange.value;
                    maxPriceInput.value = maxPriceRange.value;
                } else {
                    minPriceRange.value = minPriceInput.value;
                    maxPriceRange.value = maxPriceInput.value;
                }
                if (parseFloat(maxPriceRange.value) < parseFloat(minPriceRange.value)) {
                    if (e.target.id.includes('min')) maxPriceRange.value = minPriceRange.value;
                    else minPriceRange.value = maxPriceRange.value;
                    minPriceInput.value = minPriceRange.value;
                    maxPriceInput.value = maxPriceRange.value;
                }
                updatePriceSliderUI();
                debouncedApplyFilters();
            });
        });

        sortBySelect.addEventListener('change', () => {
            const sortValue = sortBySelect.value;
            if (['manual', 'best-selling', 'created-descending', 'created-ascending'].includes(sortValue)) {
                const currentUrl = new URL(window.location.href);
                currentUrl.searchParams.set('sort_by', sortValue);
                window.location = currentUrl.toString();
            } else { sortProducts(); }
        });

        resetBtn.addEventListener('click', () => {
            searchInput.value = '';
            minPriceInput.value = minPriceValue;
            maxPriceInput.value = maxPriceValue;
            minPriceRange.value = minPriceValue;
            maxPriceRange.value = maxPriceValue;
            updatePriceSliderUI();
            applyFilters();
            if (sortBySelect.value !== 'manual') {
                sortBySelect.value = 'manual';
                const currentUrl = new URL(window.location.href);
                currentUrl.searchParams.delete('sort_by');
                window.location = currentUrl.toString();
            }
        });

        const urlParams = new URLSearchParams(window.location.search);
        const currentSortBy = urlParams.get('sort_by');
        if (currentSortBy) { sortBySelect.value = currentSortBy; }

        updatePriceSliderUI();
        // A chamada `applyFilters` é importante para garantir que os produtos sejam mostrados na carga da página.
        applyFilters();
    }

    function addEventListeners() {
        document.body.addEventListener('click', async (e) => {
            if (e.target.closest('.add-to-cart-btn')) {
                e.preventDefault();
                const btn = e.target.closest('.add-to-cart-btn');
                const variantId = btn.dataset.variantId;
                const quantityInput = document.getElementById('product-quantity-input');
                const quantity = quantityInput ? parseInt(quantityInput.value, 10) : 1;
                if (variantId) await handleAddToCart(variantId, quantity);
            }
            if (e.target.closest('.favorite-btn')) {
                e.preventDefault(); e.stopPropagation();
                const btn = e.target.closest('.favorite-btn');
                const productId = btn.dataset.productId;
                const isFavorited = favorites.includes(productId);
                if (isFavorited) {
                    favorites = favorites.filter(id => id !== productId); showToast('Producto removido de favoritos', false);
                } else { favorites.push(productId); showToast('Producto guardado en favoritos!'); }
                saveFavorites();
                document.querySelectorAll(`.favorite-btn[data-product-id="${productId}"]`).forEach(b => b.classList.toggle('active', !isFavorited));
            }
            if (e.target.closest('#cart-sidebar .increase-qty-sidebar')) {
                const btn = e.target.closest('.increase-qty-sidebar');
                const key = btn.dataset.key;
                const input = document.querySelector(`#cart-sidebar input[data-key="${key}"]`);
                if (input) await handleUpdateCart(key, parseInt(input.value) + 1);
            }
            if (e.target.closest('#cart-sidebar .decrease-qty-sidebar')) {
                const btn = e.target.closest('.decrease-qty-sidebar');
                const key = btn.dataset.key;
                const input = document.querySelector(`#cart-sidebar input[data-key="${key}"]`);
                if (input) await handleUpdateCart(key, parseInt(input.value) - 1);
            }
            if (e.target.closest('#cart-sidebar .cart-remove-btn')) {
                e.preventDefault();
                const key = e.target.closest('.cart-remove-btn').dataset.key;
                await handleUpdateCart(key, 0);
            }
            if (e.target.closest('.close-modal-btn') || e.target.id === 'cart-overlay') {
                closeModal('help-modal-overlay');
                document.getElementById('cart-overlay')?.classList.remove('active');
                document.getElementById('cart-sidebar')?.classList.remove('active');
            }
            if (e.target.closest('#open-cart-icon')) { e.preventDefault(); openCartSidebar(); }
            if (e.target.closest('.open-help-modal-btn')) { showModal('help-modal-overlay'); }
            const searchBar = document.getElementById('search-bar');
            if (e.target.closest('#open-search-btn')) {
                e.preventDefault();
                searchBar?.classList.toggle('active');
                if (searchBar?.classList.contains('active')) document.getElementById('search-input-header').focus();
            } else if (!e.target.closest('.search-bar-container')) {
                searchBar?.classList.remove('active');
                const suggestions = document.getElementById('search-suggestions');
                if (suggestions) suggestions.style.display = 'none';
            }
        });

        document.body.addEventListener('change', (e) => {
            if (e.target.matches('#cart-sidebar .item-quantity-sidebar')) {
                const key = e.target.dataset.key;
                const quantity = parseInt(e.target.value);
                handleUpdateCart(key, quantity >= 1 ? quantity : 0);
            }
        });

        const searchInputHeader = document.getElementById('search-input-header');
        if (searchInputHeader) {
            let searchTimer;
            searchInputHeader.addEventListener('input', () => {
                clearTimeout(searchTimer);
                searchTimer = setTimeout(() => {
                    renderSearchSuggestions(searchInputHeader.value);
                }, 250);
            });
        }
    }

    init();
});