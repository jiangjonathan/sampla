(function installCustomControls(root) {
  const openCustomSelects = new Set();

  function closeCustomSelects(except = null) {
    for (const select of [...openCustomSelects]) {
      if (select !== except) select.close();
    }
  }

  function createCustomSelect(trigger, menu) {
    if (!trigger || !menu) return null;
    const label = trigger.querySelector("[data-select-label]");
    const optionElements = () => [...menu.querySelectorAll('[role="option"]')];
    let component = null;

    const close = (restoreFocus = false) => {
      menu.hidden = true;
      trigger.setAttribute("aria-expanded", "false");
      openCustomSelects.delete(component);
      if (restoreFocus) trigger.focus();
    };

    const open = () => {
      if (trigger.disabled || !optionElements().length) return;
      closeCustomSelects(component);
      menu.hidden = false;
      trigger.setAttribute("aria-expanded", "true");
      openCustomSelects.add(component);
      const selected = optionElements().find((option) => option.getAttribute("aria-selected") === "true");
      (selected || optionElements()[0]).focus();
    };

    const setValue = (value, emit = false) => {
      const option = optionElements().find((item) => item.dataset.value === String(value));
      if (!option) return false;
      trigger.dataset.value = option.dataset.value;
      if (label) label.textContent = option.textContent.trim();
      optionElements().forEach((item) => {
        item.setAttribute("aria-selected", String(item === option));
      });
      if (emit) trigger.dispatchEvent(new Event("change"));
      return true;
    };

    trigger.addEventListener("click", () => {
      if (menu.hidden) open();
      else close();
    });

    trigger.addEventListener("keydown", (event) => {
      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        event.preventDefault();
        open();
      } else if (event.key === "Escape" && !menu.hidden) {
        event.preventDefault();
        event.stopPropagation();
        close();
      }
    });

    menu.addEventListener("click", (event) => {
      const option = event.target.closest('[role="option"]');
      if (!option) return;
      setValue(option.dataset.value, true);
      close(true);
    });

    menu.addEventListener("keydown", (event) => {
      const options = optionElements();
      const current = Math.max(0, options.indexOf(document.activeElement));
      let next = null;
      if (event.key === "ArrowDown") next = (current + 1) % options.length;
      else if (event.key === "ArrowUp") next = (current - 1 + options.length) % options.length;
      else if (event.key === "Home") next = 0;
      else if (event.key === "End") next = options.length - 1;
      else if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        close(true);
        return;
      }
      if (next !== null) {
        event.preventDefault();
        options[next].focus();
      }
    });

    component = {
      trigger,
      close,
      get value() {
        return trigger.dataset.value || "";
      },
      set value(value) {
        setValue(value);
      },
      get options() {
        return optionElements().map((option) => ({ value: option.dataset.value }));
      },
      get disabled() {
        return trigger.disabled;
      },
      set disabled(disabled) {
        trigger.disabled = Boolean(disabled);
        if (trigger.disabled) close();
      },
      addEventListener(type, handler) {
        trigger.addEventListener(type, handler);
      },
      replaceOptions(options) {
        const currentValue = trigger.dataset.value || "";
        const elements = options.map(({ label: optionLabel, value }) => {
          const option = document.createElement("button");
          option.type = "button";
          option.className = "custom-option";
          option.setAttribute("role", "option");
          option.setAttribute("aria-selected", "false");
          option.dataset.value = value;
          const text = document.createElement("span");
          text.textContent = optionLabel;
          option.append(text);
          return option;
        });
        menu.replaceChildren(...elements);
        if (!setValue(currentValue) && elements.length) setValue(elements[0].dataset.value);
      },
    };

    setValue(trigger.dataset.value || "");
    return component;
  }

  function createCustomSwitch(button) {
    if (!button) return null;
    button.addEventListener("click", () => {
      button.setAttribute("aria-checked", String(button.getAttribute("aria-checked") !== "true"));
      button.dispatchEvent(new Event("change"));
    });
    return {
      get checked() {
        return button.getAttribute("aria-checked") === "true";
      },
      set checked(checked) {
        button.setAttribute("aria-checked", String(Boolean(checked)));
      },
      get disabled() {
        return button.disabled;
      },
      set disabled(disabled) {
        button.disabled = Boolean(disabled);
      },
      addEventListener(type, handler) {
        button.addEventListener(type, handler);
      },
    };
  }

  root.SamplaCustomControls = Object.freeze({
    createCustomSelect,
    createCustomSwitch,
    closeCustomSelects,
  });
})(typeof globalThis !== "undefined" ? globalThis : this);
