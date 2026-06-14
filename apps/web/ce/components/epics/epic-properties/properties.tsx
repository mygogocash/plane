/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { type FormEvent, useEffect, useState } from "react";
import { EpicService } from "@plane/services";
import type { TIssueProperty, TIssuePropertyOption, TIssuePropertyValue, TIssuePropertyValues } from "@plane/types";
import { MemberDropdown } from "@/components/dropdowns/member/dropdown";

export type TEpicPropertiesService = Pick<EpicService, "getProperties" | "getPropertyValues" | "setPropertyValue">;

export type TEpicPropertiesProps = {
  workspaceSlug: string;
  projectId: string;
  epicId: string;
  issueTypeId: string;
  initialProperties?: TIssueProperty[];
  initialValues?: TIssuePropertyValues;
  service?: TEpicPropertiesService;
};

const EMPTY_PROPERTY_VALUES: TIssuePropertyValues = {};
const epicService = new EpicService();

const optionValue = (option: TIssuePropertyOption): string => option.value ?? option.id ?? option.name ?? "";
const optionLabel = (option: TIssuePropertyOption): string =>
  option.label ?? option.name ?? option.value ?? option.id ?? "";
const getPropertyOptions = (property: TIssueProperty): TIssuePropertyOption[] => property.settings?.options ?? [];

const valueForProperty = (property: TIssueProperty, values: TIssuePropertyValues): TIssuePropertyValue => {
  const value = values[property.id];
  if (value !== undefined) return value;
  if (property.default_value !== undefined && property.default_value !== null) return property.default_value;
  if (property.is_multi || property.property_type === "multi_select") return [];
  return "";
};

export const saveEpicPropertyValues = async ({
  epicId,
  projectId,
  service,
  values,
  workspaceSlug,
}: {
  epicId: string;
  projectId: string;
  service: Pick<EpicService, "setPropertyValue">;
  values: TIssuePropertyValues;
  workspaceSlug: string;
}) =>
  await Promise.all(
    Object.entries(values).map(([propertyId, value]) =>
      service.setPropertyValue(workspaceSlug, projectId, epicId, propertyId, value)
    )
  );

export function EpicProperties(props: TEpicPropertiesProps) {
  const {
    workspaceSlug,
    projectId,
    epicId,
    issueTypeId,
    initialProperties,
    initialValues,
    service = epicService,
  } = props;
  const [properties, setProperties] = useState<TIssueProperty[]>(initialProperties ?? []);
  const [values, setValues] = useState<TIssuePropertyValues>(initialValues ?? EMPTY_PROPERTY_VALUES);
  const [isLoading, setIsLoading] = useState(!initialProperties);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (initialProperties) return;

    let isMounted = true;
    setIsLoading(true);

    const fetchProperties = async () => {
      try {
        const [fetchedProperties, fetchedValues] = await Promise.all([
          service.getProperties(workspaceSlug, issueTypeId),
          service.getPropertyValues(workspaceSlug, projectId, epicId),
        ]);
        if (!isMounted) return;
        setProperties(fetchedProperties);
        setValues(fetchedValues.property_values ?? EMPTY_PROPERTY_VALUES);
      } finally {
        if (isMounted) setIsLoading(false);
      }
    };

    void fetchProperties();

    return () => {
      isMounted = false;
    };
  }, [epicId, initialProperties, issueTypeId, projectId, service, workspaceSlug]);

  const updateValue = (propertyId: string, value: TIssuePropertyValue) =>
    setValues((currentValues) => ({ ...currentValues, [propertyId]: value }));

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsSaving(true);
    try {
      await saveEpicPropertyValues({
        epicId,
        projectId,
        service,
        values,
        workspaceSlug,
      });
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) return <div className="text-custom-text-300 text-12">Loading properties</div>;
  if (properties.length === 0) return null;

  return (
    <section className="space-y-3">
      <h4 className="text-caption-sm-medium text-secondary">Properties</h4>
      <form className="flex flex-wrap items-center gap-2" onSubmit={handleSubmit}>
        {properties.map((property) => {
          const propertyValue = valueForProperty(property, values);
          const commonClassName =
            "h-7 min-w-32 rounded border border-custom-border-200 bg-custom-background-100 px-2 text-12 text-custom-text-200 outline-none focus:border-custom-primary-100";

          return (
            <label key={property.id} className="text-custom-text-300 flex items-center gap-1 text-12">
              <span>{property.display_name}</span>
              {property.property_type === "option" || property.property_type === "select" ? (
                <select
                  name={property.id}
                  multiple={property.is_multi}
                  value={
                    property.is_multi
                      ? Array.isArray(propertyValue)
                        ? propertyValue
                        : []
                      : typeof propertyValue === "string"
                        ? propertyValue
                        : ""
                  }
                  required={property.is_required}
                  aria-label={property.display_name}
                  className={`${commonClassName} ${property.is_multi ? "h-16" : ""}`}
                  onChange={(event) => {
                    if (property.is_multi) {
                      updateValue(
                        property.id,
                        Array.from(event.target.selectedOptions).map((option) => option.value)
                      );
                    } else {
                      updateValue(property.id, event.target.value);
                    }
                  }}
                >
                  {!property.is_multi && <option value="" />}
                  {getPropertyOptions(property).map((option) => {
                    const propertyOptionValue = optionValue(option);
                    return (
                      <option key={propertyOptionValue} value={propertyOptionValue}>
                        {optionLabel(option)}
                      </option>
                    );
                  })}
                </select>
              ) : property.property_type === "multi_select" ? (
                <select
                  name={property.id}
                  multiple
                  value={Array.isArray(propertyValue) ? propertyValue : []}
                  required={property.is_required}
                  aria-label={property.display_name}
                  className={`${commonClassName} h-16`}
                  onChange={(event) =>
                    updateValue(
                      property.id,
                      Array.from(event.target.selectedOptions).map((option) => option.value)
                    )
                  }
                >
                  {getPropertyOptions(property).map((option) => {
                    const propertyOptionValue = optionValue(option);
                    return (
                      <option key={propertyOptionValue} value={propertyOptionValue}>
                        {optionLabel(option)}
                      </option>
                    );
                  })}
                </select>
              ) : property.property_type === "member" ? (
                <MemberDropdown
                  projectId={projectId}
                  value={typeof propertyValue === "string" ? propertyValue : null}
                  onChange={(memberId) => updateValue(property.id, memberId ?? "")}
                  buttonVariant="border-with-text"
                  placeholder={property.display_name}
                  multiple={false}
                  showUserDetails
                />
              ) : (
                <input
                  name={property.id}
                  type={
                    property.property_type === "number"
                      ? "number"
                      : property.property_type === "date"
                        ? "date"
                        : property.property_type === "url"
                          ? "url"
                          : "text"
                  }
                  value={(propertyValue as string | number | null | undefined) ?? ""}
                  required={property.is_required}
                  aria-label={property.display_name}
                  className={commonClassName}
                  onChange={(event) => {
                    if (property.property_type === "number")
                      return updateValue(property.id, event.target.value === "" ? null : Number(event.target.value));
                    updateValue(property.id, event.target.value);
                  }}
                />
              )}
            </label>
          );
        })}
        <button
          type="submit"
          disabled={isSaving}
          className="bg-custom-primary-100 h-7 rounded px-2 text-12 font-medium text-white disabled:opacity-60"
        >
          Save properties
        </button>
      </form>
    </section>
  );
}
