import { configureStore } from "@reduxjs/toolkit";

import { jobsReduces } from "@/lib/store/jobs/slice";

import { layerReducer } from "./layer/slice";
import { mapReducer } from "./map/slice";
import { workflowReducer } from "./workflow/slice";

const store = configureStore({
  reducer: {
    layers: layerReducer,
    map: mapReducer,
    jobs: jobsReduces,
    workflow: workflowReducer,
  },
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware({
      serializableCheck: false,
    }),
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
export default store;
