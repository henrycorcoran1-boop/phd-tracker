import React, { createContext, useContext, useReducer, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { phdTemplate, studentTemplate } from '../data/templates';

const STORAGE_KEY = '@cadence_plan_v1';

const initialState = {
  mode: 'phd',
  plan: phdTemplate(),
};

function reducer(state, action) {
  switch (action.type) {
    case 'RESTORE':
      return action.payload;

    case 'SET_MODE': {
      const mode = action.payload;
      const plan = mode === 'phd' ? phdTemplate() : studentTemplate();
      return { ...state, mode, plan };
    }

    case 'SET_PLAN_META':
      return { ...state, plan: { ...state.plan, ...action.payload } };

    case 'ADD_ITEM':
      return { ...state, plan: { ...state.plan, items: [...state.plan.items, action.payload] } };

    case 'UPDATE_ITEM': {
      const items = [...state.plan.items];
      items[action.index] = action.payload;
      return { ...state, plan: { ...state.plan, items } };
    }

    case 'DELETE_ITEM': {
      const items = state.plan.items.filter((_, i) => i !== action.index);
      return { ...state, plan: { ...state.plan, items } };
    }

    case 'CLEAR_ITEMS':
      return { ...state, plan: { ...state.plan, items: [] } };

    case 'LOAD_TEMPLATE':
      return {
        ...state,
        plan: state.mode === 'phd' ? phdTemplate() : studentTemplate(),
      };

    default:
      return state;
  }
}

const PlanContext = createContext(null);

export function PlanProvider({ children }) {
  const [state, dispatch] = useReducer(reducer, initialState);

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY).then(raw => {
      if (raw) {
        try {
          dispatch({ type: 'RESTORE', payload: JSON.parse(raw) });
        } catch (_) {}
      }
    });
  }, []);

  useEffect(() => {
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }, [state]);

  return (
    <PlanContext.Provider value={{ state, dispatch }}>
      {children}
    </PlanContext.Provider>
  );
}

export function usePlan() {
  return useContext(PlanContext);
}
