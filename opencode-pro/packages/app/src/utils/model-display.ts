type ModelWithProvider = {
  name: string
  provider: { name: string; id: string }
}

export function getModelDisplayName<T extends ModelWithProvider>(model: T, allModels: T[]): string {
  const sameNameModels = allModels.filter((m) => m.name === model.name)
  const uniqueProviders = new Set(sameNameModels.map((m) => m.provider.id))
  if (uniqueProviders.size > 1) {
    return `${model.name} (${model.provider.name})`
  }
  return model.name
}

