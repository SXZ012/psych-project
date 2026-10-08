<template>
  <button type="button" class="navigation-button">
    <span class="navigation-button__arrow" aria-hidden="true">←</span>
    <span class="navigation-button__label"><slot /></span>
  </button>
</template>

<style scoped>
/* Navigation has one appearance across themed pages, including photo backgrounds.
   Important declarations isolate this shared control from legacy page button rules. */
.navigation-button {
  box-sizing: border-box !important;
  display: inline-flex !important;
  align-items: center !important;
  justify-content: center !important;
  gap: 8px !important;
  width: max-content !important;
  min-width: 126px !important;
  height: 52px !important;
  min-height: 52px !important;
  padding: 0 18px !important;
  flex-shrink: 0 !important;
  border: 1px solid #dce4dc !important;
  border-radius: 14px !important;
  background: #f8faf5f2 !important;
  color: #34493f !important;
  font-family: inherit !important;
  font-size: 17px !important;
  font-weight: 650 !important;
  line-height: 1 !important;
  text-align: center !important;
  text-decoration: none !important;
  white-space: nowrap !important;
  text-shadow: none !important;
  box-shadow: none !important;
  backdrop-filter: none !important;
  -webkit-backdrop-filter: none !important;
  transform: none !important;
  transition: none !important;
  cursor: pointer;
  touch-action: manipulation;
  -webkit-tap-highlight-color: transparent !important;
}
.navigation-button > span {
  display: inline !important;
  font: inherit !important;
  color: inherit !important;
  margin: 0 !important;
}
.navigation-button:focus:not(:focus-visible) { outline: none !important; }
.navigation-button:focus-visible { outline: 3px solid #52745e !important; outline-offset: 3px !important; }
.navigation-button:disabled { opacity: .55; cursor: default; }
@media (max-width: 700px) {
  .navigation-button { min-width: 108px !important; padding-inline: 12px !important; font-size: 15px !important; }
}
</style>
