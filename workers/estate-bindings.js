/**
 * Property, repository, and investigation-profile lookup.
 *
 * The governed estate registry operating block and brands.json are the only
 * sources. A registry repository that disagrees with the brand repo fails closed.
 * Null investigation or verification profiles stay null. They are confluence
 * debt, not values this module is allowed to invent.
 */

import registry from '../estate/registry.json';
import brands from '../brands.json';
import healthTargets from '../config/health-targets.json';

function normalize(value) {
  return String(value || '').trim().toLowerCase();
}

export function resolveEstateBinding(propertyId) {
  const id = normalize(propertyId);
  const property = (registry.properties || []).find((item) => (
    normalize(item?.id) === id || normalize(item?.domain) === id
  ));
  if (!property) return null;
  const brand = property.brand_id ? brands.public?.[property.brand_id] : null;
  const operating = property.operating || {};
  const fromRegistry = operating.repository || null;
  const fromBrand = brand?.repo || null;
  const conflict = Boolean(
    fromRegistry && fromBrand && normalize(fromRegistry) !== normalize(fromBrand),
  );
  return {
    propertyId: property.id,
    displayName: property.display_name || property.domain,
    repository: conflict ? null : (fromRegistry || fromBrand || null),
    conflict,
    investigationProfile: operating.investigation_profile || null,
    verificationProfile: operating.verification_profile || null,
    verificationScope: operating.verification_scope || null,
    verificationPredicate: operating.verification_predicate || null,
    // MC-FW-002: host-registered FWOMPS PREPARE workspace/repository/profile ids. Null until registered.
    prepareBinding: operating.prepare_binding || null,
  };
}

export function qualificationGaps(binding) {
  if (!binding || binding.conflict) {
    return ['canonical repository'];
  }
  const gaps = [];
  if (!binding.repository) gaps.push('canonical repository');
  if (!binding.investigationProfile) gaps.push('investigation profile');
  if (!binding.verificationProfile) gaps.push('verification profile');
  if (!binding.verificationScope) gaps.push('verification scope');
  if (!binding.verificationPredicate) gaps.push('verification predicate');
  return gaps;
}

export function healthTargetById(targetId) {
  return (healthTargets.targets || []).find((target) => target.id === targetId) || null;
}

export function propertyIdForHealthTarget(target) {
  if (target?.machineContract?.propertyId) return target.machineContract.propertyId;
  if (!target?.url) return null;
  try {
    return new URL(target.url).hostname.replace(/^www\./, '');
  } catch {
    return null;
  }
}
