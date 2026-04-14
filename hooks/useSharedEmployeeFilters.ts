import { useMemo } from 'react';
import { Employee, SharedFilters } from '../types';
import { sortEmployees, employeeMatchesSharedFilters, groupEmployeesByTerritory } from '../utils';

/**
 * Каскадные опции фильтров и отфильтрованные сотрудники — единая логика для всех разделов.
 */
export function useSharedEmployeeFilters(allEmployees: Employee[], sharedFilters: SharedFilters) {
  const { terr, group, rep, role, status } = sharedFilters;

  const territories = useMemo(
    () => Array.from(new Set(allEmployees.map(e => e.Область))).sort(),
    [allEmployees]
  );

  const filteredByTerr = useMemo(
    () => (terr ? allEmployees.filter(e => e.Область === terr) : allEmployees),
    [allEmployees, terr]
  );

  const groups = useMemo(
    () => Array.from(new Set(filteredByTerr.map(e => e.Группа))).sort(),
    [filteredByTerr]
  );

  const filteredByGroup = useMemo(
    () => (group ? filteredByTerr.filter(e => e.Группа === group) : filteredByTerr),
    [filteredByTerr, group]
  );

  const repsList = useMemo(
    () => Array.from(new Set(filteredByGroup.map(e => e.МП))).sort(),
    [filteredByGroup]
  );

  const roles = useMemo(
    () => Array.from(new Set(filteredByGroup.map(e => e.Роль))).sort(),
    [filteredByGroup]
  );

  const statuses = useMemo(
    () => Array.from(new Set(filteredByGroup.map(e => e.Статус))).sort(),
    [filteredByGroup]
  );

  const filteredEmployees = useMemo(
    () => allEmployees.filter(e => employeeMatchesSharedFilters(e, sharedFilters)).sort(sortEmployees),
    [allEmployees, terr, group, rep, role, status]
  );

  const groupedByTerritory = useMemo(
    () => groupEmployeesByTerritory(filteredEmployees),
    [filteredEmployees]
  );

  return {
    territories,
    groups,
    repsList,
    roles,
    statuses,
    filteredEmployees,
    groupedByTerritory,
  };
}
