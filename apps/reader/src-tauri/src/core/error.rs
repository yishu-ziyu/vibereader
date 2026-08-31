use std::fmt;

#[derive(Debug)]
pub enum StorageError {
    Database(String),
    Validation(String),
}

impl StorageError {
    pub fn code(&self) -> &'static str {
        match self {
            StorageError::Database(_) => "database_error",
            StorageError::Validation(_) => "validation_error",
        }
    }

    pub fn message(&self) -> &str {
        match self {
            StorageError::Database(message) | StorageError::Validation(message) => message,
        }
    }
}

impl fmt::Display for StorageError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(formatter, "{}: {}", self.code(), self.message())
    }
}

impl std::error::Error for StorageError {}

impl From<rusqlite::Error> for StorageError {
    fn from(error: rusqlite::Error) -> Self {
        StorageError::Database(error.to_string())
    }
}

pub type StorageResult<T> = Result<T, StorageError>;
