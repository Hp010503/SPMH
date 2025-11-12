document.addEventListener('DOMContentLoaded', function () {
    let salesData = [];
    let addressData = {};
    let hashtagData = [];
    let currentPage = 1;
    const itemsPerPage = 30;

    let allProducts = [];
    let products = [];
    let currentFilters = {
        address: '', area: null, price: 200, hashtags: []
    };

    function createDummyProducts() {
        const dummyData = [];
        for (let i = 1; i <= 250; i++) {
            const salePeople = ["V.Anh", "Chiến", "Hoàng", "Linh", "Sơn"];
            const addresses = ["Thôn Sâm Linh", "Xã Tú Sơn", "Tiểu khu Cẩm Xuân", "Xã Đại Đồng", "Thôn Lão Phong 1"];
            const names = ["Đất nền ven hồ", "Biệt thự nghỉ dưỡng", "Nhà phố thương mại", "Đất sào công nghiệp"];
            dummyData.push({
                id: i, name: `${names[i % names.length]} #${i}`, address: addresses[i % addresses.length],
                code: `CODE${i}`, sale: salePeople[i % salePeople.length], mapLink: "#",
                area: (100 + i * 5).toString(), pricePerSqm: `${(i * 0.8).toFixed(1)} triệu/m²`,
                fee: `${(10 + i)} triệu`, description: `Đây là mô tả chi tiết cho sản phẩm số ${i}.`,
                images: [`https://picsum.photos/400/400?random=${i}`], hashtags: ["đầu tư", "ở", "kinh doanh", "gần vin", "xây nhà vườn"].slice(i % 3, i % 3 + 2)
            });
        }
        return dummyData;
    }
    allProducts = createDummyProducts();

    // --- DOM Selections ---
    const productListContainer = document.getElementById('product-list');
    const paginationContainer = document.getElementById('pagination-controls');
    
    const productModal = document.getElementById('product-modal');
    const modalInfo = productModal.querySelector('.modal-info');
    const closeModalButton = productModal.querySelector('.close-button');
    const imageGallery = productModal.querySelector('.modal-image-gallery');
    const modalImage = document.getElementById('modal-image');
    const prevBtn = document.getElementById('prev-image');
    const nextBtn = document.getElementById('next-image');
    const imageDotsContainer = document.getElementById('image-dots');
    
    const lightbox = document.getElementById('lightbox-overlay');
    const lightboxImage = document.getElementById('lightbox-image');
    const closeLightboxBtn = document.getElementById('close-lightbox');

    const openSearchBtn = document.getElementById('open-search-btn');
    const searchModal = document.getElementById('search-modal');
    const searchAddressInput = document.getElementById('search-address');
    const searchAreaInput = document.getElementById('search-area'); // MỚI
    const searchPriceSlider = document.getElementById('search-price');
    const priceValueDisplay = document.getElementById('price-value');
    const searchHashtagsSelect = document.getElementById('search-hashtags');
    const applyFiltersBtn = document.getElementById('apply-filters-btn');
    const cancelSearchBtn = document.getElementById('cancel-search-btn');
    const clearFiltersBtn = document.getElementById('clear-filters-btn');

    let currentProduct;
    let currentImageIndex;
    let touchStartX = 0;
    let touchEndX = 0;

    async function initializeApp() {
        try {
            const [salesResponse, addressResponse, hashtagResponse] = await Promise.all([
                fetch('info.json'), fetch('Address.json'), fetch('hastag.json')
            ]);
            if (!salesResponse.ok || !addressResponse.ok || !hashtagResponse.ok) throw new Error(`HTTP error!`);
            
            salesData = await salesResponse.json();
            addressData = await addressResponse.json();
            const hashtagJson = await hashtagResponse.json();
            hashtagData = hashtagJson.hastag;

            products = [...allProducts];

            populateFilterOptions();
            renderProducts();
            setupEventListeners();
        } catch (error) { console.error("Không thể tải hoặc xử lý file JSON:", error); }
    }
    
    // --- Các hàm xử lý dữ liệu thông minh (không đổi) ---
    function normalizeAddress(str) {
        if (!str) return '';
        return str.toLowerCase().replace(/^(xã|phường|thị trấn|thôn|tiểu khu)\s+/i, '').trim();
    }
    function getSmartAddress(originalAddress) {
        if (!addressData || !addressData.danh_sach_xa_moi || !originalAddress) return originalAddress;
        const districtName = addressData.ten_huyen || '';
        const normalizedOriginal = normalizeAddress(originalAddress);
        for (const newCommune of addressData.danh_sach_xa_moi) {
            for (const oldUnit of newCommune.cac_don_vi_cu_sap_nhap) {
                for (const villageName of oldUnit.thon_to_dan_pho) {
                    if (normalizedOriginal.includes(normalizeAddress(villageName))) {
                        let finalAddress = `${originalAddress}`;
                        if (!normalizedOriginal.includes(normalizeAddress(oldUnit.ten_don_vi_cu))) finalAddress += ` (thuộc ${oldUnit.ten_don_vi_cu})`;
                        finalAddress += `, nay thuộc ${newCommune.ten_xa_moi}`;
                        if (!normalizedOriginal.includes(normalizeAddress(districtName))) finalAddress += `, ${districtName}`;
                        return finalAddress;
                    }
                }
            }
        }
        for (const newCommune of addressData.danh_sach_xa_moi) {
            for (const oldUnit of newCommune.cac_don_vi_cu_sap_nhap) {
                if (normalizedOriginal.includes(normalizeAddress(oldUnit.ten_don_vi_cu))) {
                    const updatedPart = `${oldUnit.ten_don_vi_cu} (nay thuộc ${newCommune.ten_xa_moi})`;
                    if (normalizeAddress(originalAddress).includes(normalizeAddress(districtName))) {
                         return originalAddress.replace(new RegExp(oldUnit.ten_don_vi_cu, 'i'), updatedPart);
                    } else { return `${updatedPart}, ${districtName}`; }
                }
            }
        }
        return originalAddress;
    }
    function getSmartHashtags(rawHashtags = []) {
        if (!hashtagData || hashtagData.length === 0) return rawHashtags;
        const matchedTags = new Set();
        const keywords = rawHashtags.join(' ').toLowerCase().split(/,|\s|hoặc|và|để/).filter(k => k.length > 1);
        keywords.forEach(keyword => {
            const normalizedKeyword = keyword.trim();
            if (!normalizedKeyword) return;
            const candidates = hashtagData.filter(standardTag => standardTag.toLowerCase().includes(normalizedKeyword));
            if (candidates.length > 0) {
                candidates.sort((a, b) => a.length - b.length);
                matchedTags.add(candidates[0]);
            }
        });
        return Array.from(matchedTags);
    }

    function populateFilterOptions() {
        if (!searchHashtagsSelect) return;
        const sortedHashtags = [...hashtagData].sort();
        searchHashtagsSelect.innerHTML = sortedHashtags
            .map(tag => `<option value="${tag}">${tag}</option>`)
            .join('');
    }

    function applyFilters() {
        let filtered = [...allProducts];

        // 1. Lọc theo địa chỉ
        const addressTerm = currentFilters.address.toLowerCase();
        if (addressTerm) {
            filtered = filtered.filter(p => getSmartAddress(p.address).toLowerCase().includes(addressTerm));
        }
        
        // 2. Lọc theo diện tích
        const minArea = currentFilters.area;
        if (minArea && minArea > 0) {
            filtered = filtered.filter(p => {
                const productArea = parseInt(p.area, 10);
                return !isNaN(productArea) && productArea >= minArea;
            });
        }

        // 3. Lọc theo giá
        const maxPrice = currentFilters.price;
        if (maxPrice < 200) {
            filtered = filtered.filter(p => {
                const priceNum = parseFloat(p.pricePerSqm);
                return !isNaN(priceNum) && priceNum <= maxPrice;
            });
        }

        // 4. Lọc theo hashtag
        const selectedHashtags = currentFilters.hashtags;
        if (selectedHashtags.length > 0) {
            filtered = filtered.filter(p => {
                const productHashtags = getSmartHashtags(p.hashtags);
                return selectedHashtags.every(filterTag => productHashtags.includes(filterTag));
            });
        }
        
        products = filtered;
        currentPage = 1;
        renderProducts();
    }


    function renderPagination() {
        const totalPages = Math.ceil(products.length / itemsPerPage);
        const paginationPagesContainer = paginationContainer.querySelector('.pagination-pages');
        if (!paginationContainer) return;
        
        paginationContainer.innerHTML = '';
        if (totalPages <= 1) return;

        const siblingCount = 1;
        const ELLIPSIS = '...';
        const range = (start, end) => Array.from({ length: end - start + 1 }, (_, i) => start + i);
        let pages = [];
        const totalPageNumbers = siblingCount * 2 + 5;

        if (totalPages <= totalPageNumbers) {
            pages = range(1, totalPages);
        } else {
            const leftSiblingIndex = Math.max(currentPage - siblingCount, 1);
            const rightSiblingIndex = Math.min(currentPage + siblingCount, totalPages);
            const shouldShowLeftDots = leftSiblingIndex > 2;
            const shouldShowRightDots = rightSiblingIndex < totalPages - 2;

            if (!shouldShowLeftDots && shouldShowRightDots) {
                let leftItemCount = 3 + 2 * siblingCount;
                pages = [...range(1, leftItemCount), ELLIPSIS, totalPages];
            } else if (shouldShowLeftDots && !shouldShowRightDots) {
                let rightItemCount = 3 + 2 * siblingCount;
                pages = [1, ELLIPSIS, ...range(totalPages - rightItemCount + 1, totalPages)];
            } else {
                pages = [1, ELLIPSIS, ...range(leftSiblingIndex, rightSiblingIndex), ELLIPSIS, totalPages];
            }
        }
        
        let pagesHtml = pages.map(page => {
            if (page === ELLIPSIS) return `<span class="page-ellipsis">...</span>`;
            return `<button class="page-number ${page === currentPage ? 'active' : ''}" data-page="${page}">${page}</button>`;
        }).join('');
        
        paginationContainer.innerHTML = `
            <button id="first-page-btn" class="pagination-btn" ${currentPage === 1 ? 'disabled' : ''}>&lt;&lt;</button>
            <button id="prev-page-btn" class="pagination-btn" ${currentPage === 1 ? 'disabled' : ''}>&lt;</button>
            <div class="pagination-pages">${pagesHtml}</div>
            <button id="next-page-btn" class="pagination-btn" ${currentPage === totalPages ? 'disabled' : ''}>&gt;</button>
            <button id="last-page-btn" class="pagination-btn" ${currentPage === totalPages ? 'disabled' : ''}>&gt;&gt;</button>
        `;
    }

    function renderProducts() {
        if (!productListContainer) return;
        const startIndex = (currentPage - 1) * itemsPerPage;
        const endIndex = startIndex + itemsPerPage;
        const paginatedProducts = products.slice(startIndex, endIndex);

        if (paginatedProducts.length === 0) {
            productListContainer.innerHTML = `<p style="text-align: center; color: #888; grid-column: 1 / -1;">Không tìm thấy sản phẩm nào phù hợp.</p>`;
        } else {
            productListContainer.innerHTML = paginatedProducts.map(product => {
                const cleanedHashtags = getSmartHashtags(product.hashtags);
                return `
                    <div class="product-card" data-id="${product.id}">
                        <div class="product-card__image-wrapper">
                             <img src="${product.images[0]}" alt="${product.name}" class="product-card__image">
                             <span class="product-card__code">#${product.code}</span>
                        </div>
                        <div class="product-card__info">
                            <div>
                                <h3 class="product-card__name">${product.name}</h3>
                                <p class="product-card__address">${getSmartAddress(product.address)}</p>
                                <p class="product-card__sale">Sale: ${product.sale}</p>
                            </div>
                            <div style="margin-top: auto;">
                                <div class="product-card__meta-row">
                                    <span class="product-card__price">${product.pricePerSqm}</span>
                                    <span>${product.area}m²</span>
                                </div>
                                <div class="product-card__hashtags">
                                    ${cleanedHashtags.slice(0, 3).map(tag => `<span class="hashtag-item-card">${tag}</span>`).join('')}
                                </div>
                            </div>
                        </div>
                    </div>
                `;
            }).join('');
        }
        renderPagination();
    }

    function showImage(index) {
        modalImage.src = currentProduct.images[index];
        const dots = imageDotsContainer.querySelectorAll('.dot');
        dots.forEach((dot, i) => dot.classList.toggle('active', i === index));
    }
    function handleNextImage() {
        currentImageIndex = (currentImageIndex + 1) % currentProduct.images.length;
        showImage(currentImageIndex);
    }
    function handlePrevImage() {
        currentImageIndex = (currentImageIndex - 1 + currentProduct.images.length) % currentProduct.images.length;
        showImage(currentImageIndex);
    }
    function openModal(productId) {
        currentProduct = allProducts.find(p => p.id === productId);
        if (!currentProduct) return;
        const defaultSale = { Sale: "Không tìm thấy", Thongtin: { sdt: "", zalo: "", facebook: "#" } };
        const saleInfo = salesData.find(s => s.Sale === currentProduct.sale) || defaultSale;
        imageDotsContainer.innerHTML = '';
        currentProduct.images.forEach((_, index) => {
            const dot = document.createElement('span');
            dot.classList.add('dot'); dot.dataset.index = index;
            imageDotsContainer.appendChild(dot);
        });
        currentImageIndex = 0;
        showImage(currentImageIndex);
        document.getElementById('modal-address').textContent = getSmartAddress(currentProduct.address);
        document.getElementById('modal-code').textContent = `#${currentProduct.code}`;
        document.getElementById('modal-sale').textContent = saleInfo.Sale;
        document.getElementById('contact-phone').href = `tel:${saleInfo.Thongtin.sdt}`;
        document.getElementById('contact-zalo').href = `https://zalo.me/${saleInfo.Thongtin.zalo}`;
        document.getElementById('contact-facebook').href = `https://${saleInfo.Thongtin.facebook}`;
        document.getElementById('modal-area').textContent = `${currentProduct.area}m²`;
        document.getElementById('modal-price').textContent = currentProduct.pricePerSqm;
        document.getElementById('modal-fee').textContent = currentProduct.fee;
        document.getElementById('modal-description').textContent = currentProduct.description;
        document.getElementById('modal-map-link').href = currentProduct.mapLink;
        const hashtagsContainer = productModal.querySelector('#modal-hashtags');
        const cleanedHashtags = getSmartHashtags(currentProduct.hashtags);
        hashtagsContainer.innerHTML = cleanedHashtags.map(tag => `<span class="hashtag-item">${tag}</span>`).join('');
        document.body.classList.add('modal-is-open');
        productModal.classList.add('show');
    }
    function closeModal() {
        document.body.classList.remove('modal-is-open');
        productModal.classList.remove('show');
    }
    function handleSwipe() {
        const swipeDistance = touchEndX - startX;
        if (swipeDistance < -50) handleNextImage();
        if (swipeDistance > 50) handlePrevImage();
    }
    function setupEventListeners() {
        productListContainer.addEventListener('click', e => {
            const card = e.target.closest('.product-card');
            if (card) openModal(parseInt(card.dataset.id, 10));
        });

        openSearchBtn.addEventListener('click', () => searchModal.classList.add('show'));
        cancelSearchBtn.addEventListener('click', () => searchModal.classList.remove('show'));
        searchModal.addEventListener('click', e => {
            if (e.target === searchModal) searchModal.classList.remove('show');
        });

        searchPriceSlider.addEventListener('input', (e) => {
            const value = e.target.value;
            if (value == 200) {
                 priceValueDisplay.textContent = 'Mọi mức giá';
            } else {
                 priceValueDisplay.textContent = `Lên đến ${value} triệu/m²`;
            }
        });
        
        applyFiltersBtn.addEventListener('click', () => {
            currentFilters.address = searchAddressInput.value;
            currentFilters.area = parseInt(searchAreaInput.value, 10) || null;
            currentFilters.price = parseInt(searchPriceSlider.value, 10);
            currentFilters.hashtags = Array.from(searchHashtagsSelect.selectedOptions).map(opt => opt.value);
            applyFilters();
            searchModal.classList.remove('show');
        });

        clearFiltersBtn.addEventListener('click', () => {
            currentFilters = { address: '', area: null, price: 200, hashtags: [] };
            searchAddressInput.value = '';
            searchAreaInput.value = '';
            searchPriceSlider.value = 200;
            priceValueDisplay.textContent = 'Mọi mức giá';
            Array.from(searchHashtagsSelect.options).forEach(opt => opt.selected = false);
            applyFilters();
            searchModal.classList.remove('show');
        });

        paginationContainer.addEventListener('click', (e) => {
            const totalPages = Math.ceil(products.length / itemsPerPage);
            let pageChanged = false;
            const target = e.target.closest('button');
            if (!target) return;

            if (target.matches('.page-number')) {
                const page = parseInt(target.dataset.page, 10);
                if (page !== currentPage) { currentPage = page; pageChanged = true; }
            } else if (target.id === 'next-page-btn' && currentPage < totalPages) {
                currentPage++; pageChanged = true;
            } else if (target.id === 'prev-page-btn' && currentPage > 1) {
                currentPage--; pageChanged = true;
            } else if (target.id === 'first-page-btn' && currentPage > 1) {
                currentPage = 1; pageChanged = true;
            } else if (target.id === 'last-page-btn' && currentPage < totalPages) {
                currentPage = totalPages; pageChanged = true;
            }

            if (pageChanged) {
                renderProducts();
                window.scrollTo({ top: 0, behavior: 'smooth' });
            }
        });

        closeModalButton.addEventListener('click', closeModal);
        productModal.addEventListener('click', e => { if (e.target === productModal) closeModal(); });
        prevBtn.addEventListener('click', handlePrevImage);
        nextBtn.addEventListener('click', handleNextImage);
        imageDotsContainer.addEventListener('click', (e) => {
            if (e.target.classList.contains('dot')) {
                currentImageIndex = parseInt(e.target.dataset.index, 10);
                showImage(currentImageIndex);
            }
        });
        imageGallery.addEventListener('touchstart', (e) => { touchStartX = e.changedTouches[0].screenX; });
        imageGallery.addEventListener('touchend', (e) => { touchEndX = e.changedTouches[0].screenX; handleSwipe(); });
        modalImage.addEventListener('click', () => {
            lightboxImage.src = modalImage.src; lightbox.classList.add('show');
        });
        closeLightboxBtn.addEventListener('click', () => lightbox.classList.remove('show'));
        lightbox.addEventListener('click', e => { if (e.target === lightbox) lightbox.classList.remove('show'); });
    }

    initializeApp();
});