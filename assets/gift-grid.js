import { CartErrorEvent, CartLinesUpdateEvent } from '@shopify/events';
import { formatMoney } from '@theme/money-formatting';
import { lockScroll, unlockScroll } from '@theme/utilities';

class GiftGridComponent extends HTMLElement {
  #abortController = new AbortController();
  #dialog = null;
  #dialogContent = null;
  #activeTrigger = null;
  #currentProductId = '';
  #addButton = null;
  #closeButton = null;
  #status = null;
  #currentImage = null;
  #currentPrice = null;
  #selectedVariantInput = null;

  connectedCallback() {
    this.#dialog = this.querySelector('[data-gift-grid-dialog]');
    this.#dialogContent = this.querySelector('[data-gift-grid-dialog-content]');

    if (!(this.#dialog instanceof HTMLDialogElement) || !(this.#dialogContent instanceof HTMLElement)) return;

    this.addEventListener('click', this.#handleClick, { signal: this.#abortController.signal });
    this.addEventListener('change', this.#handleChange, { signal: this.#abortController.signal });
    this.#dialog.addEventListener('cancel', this.#handleCancel, { signal: this.#abortController.signal });
    this.#dialog.addEventListener('click', this.#handleBackdropClick, { signal: this.#abortController.signal });
    this.#dialog.addEventListener('close', this.#handleDialogClose, { signal: this.#abortController.signal });
  }

  disconnectedCallback() {
    this.#abortController.abort();
    this.#abortController = new AbortController();

    if (this.#dialog instanceof HTMLDialogElement) {
      unlockScroll(this.#dialog);
    }
  }

  #handleClick = (event) => {
    const target = event.target instanceof Element ? event.target : null;
    const trigger = target?.closest('[data-gift-grid-trigger]');
    const closeButton = target?.closest('[data-gift-grid-close]');
    const addButton = target?.closest('[data-gift-grid-add]');

    if (trigger instanceof HTMLElement) {
      event.preventDefault();
      this.#open(trigger);
      return;
    }

    if (closeButton instanceof HTMLElement) {
      event.preventDefault();
      this.#close();
      return;
    }

    if (addButton instanceof HTMLElement) {
      event.preventDefault();
      this.#addToCart();
    }
  };

  #handleChange = (event) => {
    const target = event.target instanceof Element ? event.target : null;
    const input = target?.closest('[data-gift-grid-variant-radio]');

    if (!(input instanceof HTMLInputElement)) return;

    this.#selectedVariantInput = input;
    this.#syncSelectedVariant();
  };

  #handleCancel = (event) => {
    event.preventDefault();
    this.#close();
  };

  #handleBackdropClick = (event) => {
    if (event.target === this.#dialog) {
      this.#close();
    }
  };

  #handleDialogClose = () => {
    this.#resetDialogState();
  };

  #open(trigger) {
    if (!(this.#dialog instanceof HTMLDialogElement) || !(this.#dialogContent instanceof HTMLElement)) return;

    const card = trigger.closest('[data-gift-grid-card]');
    const template = card?.querySelector('template[data-gift-grid-template]');

    if (!(template instanceof HTMLTemplateElement)) return;

    this.#activeTrigger = trigger;
    this.#currentProductId = card?.dataset.productId || '';

    this.#dialogContent.replaceChildren(template.content.cloneNode(true));
    this.#cacheDialogRefs();
    this.#syncDialogA11y();
    this.#syncSelectedVariant();

    lockScroll(this.#dialog);
    this.#dialog.showModal();

    window.requestAnimationFrame(() => {
      (this.#closeButton ?? this.#addButton)?.focus();
    });

    trigger.setAttribute('aria-expanded', 'true');
  }

  #close() {
    if (!(this.#dialog instanceof HTMLDialogElement) || !this.#dialog.open) return;

    this.#dialog.close();
    unlockScroll(this.#dialog);

    if (this.#activeTrigger instanceof HTMLElement) {
      this.#activeTrigger.setAttribute('aria-expanded', 'false');
      window.requestAnimationFrame(() => this.#activeTrigger?.focus());
    }
  }

  #resetDialogState() {
    this.#addButton = null;
    this.#closeButton = null;
    this.#status = null;
    this.#currentImage = null;
    this.#currentPrice = null;
    this.#selectedVariantInput = null;

    if (this.#dialogContent) {
      this.#dialogContent.replaceChildren();
    }
  }

  #cacheDialogRefs() {
    if (!(this.#dialogContent instanceof HTMLElement)) return;

    this.#addButton = /** @type {HTMLButtonElement | null} */ (this.#dialogContent.querySelector('[data-gift-grid-add]'));
    this.#closeButton = /** @type {HTMLButtonElement | null} */ (this.#dialogContent.querySelector('[data-gift-grid-close]'));
    this.#status = /** @type {HTMLElement | null} */ (this.#dialogContent.querySelector('[data-gift-grid-status]'));
    this.#currentImage = /** @type {HTMLImageElement | null} */ (this.#dialogContent.querySelector('.gift-grid-modal__image'));
    this.#currentPrice = /** @type {HTMLElement | null} */ (this.#dialogContent.querySelector('[data-gift-grid-modal-price]'));
    this.#selectedVariantInput = /** @type {HTMLInputElement | null} */ (
      this.#dialogContent.querySelector('[data-gift-grid-variant-radio]:checked')
    );
  }

  #syncDialogA11y() {
    if (!(this.#dialog instanceof HTMLDialogElement) || !(this.#dialogContent instanceof HTMLElement)) return;

    const title = this.#dialogContent.querySelector('[data-gift-grid-modal-title]');
    const description = this.#dialogContent.querySelector('[data-gift-grid-modal-description]');

    if (title instanceof HTMLElement) {
      this.#dialog.setAttribute('aria-labelledby', title.id);
    }

    if (description instanceof HTMLElement) {
      this.#dialog.setAttribute('aria-describedby', description.id);
    } else {
      this.#dialog.removeAttribute('aria-describedby');
    }
  }

  #syncSelectedVariant() {
    if (!(this.#dialogContent instanceof HTMLElement) || !(this.#selectedVariantInput instanceof HTMLInputElement)) return;

    const selectedInput = this.#selectedVariantInput;
    const selectedVariantId = selectedInput.value;
    const selectedVariantPrice = Number(selectedInput.dataset.variantPrice || '0');
    const selectedVariantAvailable = selectedInput.dataset.variantAvailable === 'true';

    if (this.#currentPrice instanceof HTMLElement) {
      this.#currentPrice.textContent = this.#formatMoney(selectedVariantPrice);
    }

    if (this.#addButton instanceof HTMLButtonElement) {
      this.#addButton.disabled = !selectedVariantAvailable;
      this.#addButton.textContent = selectedVariantAvailable ? 'Add to cart' : 'Sold out';
      this.#addButton.setAttribute('aria-busy', 'false');
    }

    if (this.#status instanceof HTMLElement) {
      this.#status.textContent = '';
    }

    if (this.#currentImage instanceof HTMLImageElement) {
      const nextImage = selectedInput.dataset.variantImage;
      const nextAlt = selectedInput.dataset.variantImageAlt;

      if (nextImage) {
        this.#currentImage.src = nextImage;
      }

      if (nextAlt) {
        this.#currentImage.alt = nextAlt;
      }
    }

    this.#dialogContent.querySelectorAll('[data-gift-grid-variant-radio]').forEach((input) => {
      if (!(input instanceof HTMLInputElement)) return;
      input.checked = input.value === selectedVariantId;
    });
  }

  #formatMoney(moneyValue) {
    const format = this.dataset.moneyFormat || '{{amount}}';
    const currency = this.dataset.currency || Shopify.currency?.active || 'USD';
    return formatMoney(moneyValue, format, currency);
  }

  #getSelectedVariant() {
    if (!(this.#dialogContent instanceof HTMLElement)) return null;

    const checked = this.#dialogContent.querySelector('[data-gift-grid-variant-radio]:checked');
    if (!(checked instanceof HTMLInputElement)) return null;

    return {
      id: checked.value,
      available: checked.dataset.variantAvailable === 'true',
    };
  }

  #getCartSections() {
    return Array.from(document.querySelectorAll('cart-items-component'))
      .map((item) => (item instanceof HTMLElement ? item.dataset.sectionId : ''))
      .filter(Boolean);
  }

  #getProductId() {
    return this.#currentProductId;
  }

  #setStatus(message) {
    if (!(this.#status instanceof HTMLElement)) return;
    this.#status.textContent = message;
  }

  #setLoading(isLoading) {
    const selectedVariant = this.#getSelectedVariant();

    if (!(this.#addButton instanceof HTMLButtonElement)) return;

    this.#addButton.disabled = isLoading || !selectedVariant?.available;
    this.#addButton.setAttribute('aria-busy', isLoading ? 'true' : 'false');
    this.#addButton.textContent = isLoading ? 'Adding...' : selectedVariant?.available ? 'Add to cart' : 'Sold out';
  }

  async #addToCart() {
    const selectedVariant = this.#getSelectedVariant();

    if (!selectedVariant) return;

    if (!selectedVariant.available) {
      this.#setStatus('This variant is sold out.');
      return;
    }

    const variantId = selectedVariant.id;
    const itemCount = 1;
    const deferredEventPromise = CartLinesUpdateEvent.createPromise();

    this.dispatchEvent(
      new CartLinesUpdateEvent({
        action: 'add',
        context: 'product',
        lines: [
          {
            merchandiseId: variantId,
            quantity: itemCount,
          },
        ],
        promise: deferredEventPromise.promise,
      })
    );

    this.#setLoading(true);

    const payload = {
      items: [
        {
          id: Number(variantId),
          quantity: itemCount,
        },
      ],
      sections: this.#getCartSections().join(','),
    };

    try {
      const response = await fetch(Theme.routes.cart_add_url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify(payload),
      }).then((result) => result.json());

      if (response.status) {
        this.dispatchEvent(
          new CartErrorEvent({
            error: response.message || 'Add to cart failed',
            code: 'INVALID',
            detail: {
              description: response.description,
              errors: response.errors,
            },
          })
        );

        const ajaxCart = await this.#refreshCart();
        deferredEventPromise.resolve({
          cart: CartLinesUpdateEvent.createCartFromAjaxResponse(ajaxCart),
          detail: {
            didError: true,
            items: ajaxCart.items,
            source: 'gift-grid-component',
            sourceId: this.dataset.sectionId,
            itemCount,
            productId: this.#getProductId(),
            sections: response.sections,
          },
        });

        this.#setStatus(response.message || 'Unable to add this item.');
        return;
      }

      const cart = await this.#refreshCart();
      deferredEventPromise.resolve({
        cart: CartLinesUpdateEvent.createCartFromAjaxResponse(cart),
        detail: {
          items: cart.items,
          source: 'gift-grid-component',
          sourceId: this.dataset.sectionId,
          itemCount,
          productId: this.#getProductId(),
          sections: response.sections,
          didError: false,
        },
      });

      this.#close();
    } catch (error) {
      console.error(error);
      deferredEventPromise.reject(error);

      this.dispatchEvent(
        new CartErrorEvent({
          error: error?.message || 'Network error during add to cart',
          code: 'SERVICE_UNAVAILABLE',
        })
      );

      this.#setStatus('Unable to add this item right now.');
    } finally {
      this.#setLoading(false);
    }
  }

  async #refreshCart() {
    const response = await fetch(`${Theme.routes.cart_url}.json`, {
      headers: {
        Accept: 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to refresh cart: HTTP ${response.status}`);
    }

    return response.json();
  }
}

if (!customElements.get('gift-grid-component')) {
  customElements.define('gift-grid-component', GiftGridComponent);
}
