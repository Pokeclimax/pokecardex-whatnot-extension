import { addExtractedCard, loadState, subscribeToState } from "../storage/storageAdapter";
import { installPokecardexContent } from "./injectButton";

installPokecardexContent({
  addCard: (card) => addExtractedCard(card),
  loadState: () => loadState(),
  subscribe: (listener) => subscribeToState(listener),
  openList: () => {
    chrome.runtime.sendMessage({ type: "PCDX_OPEN_LIST" }, () => {
      void chrome.runtime.lastError;
    });
  },
});
